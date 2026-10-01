/**
 * Stockfish web-worker client.
 *
 * The vendored build (see scripts/setup-engine.mjs) is a *classic* worker
 * script that speaks raw UCI: `postMessage(string)` in, strings out, and it
 * resolves its own `.wasm` next to the script URL. This file wraps that in a
 * promise-based API with a single-search queue, cancellation and a progress
 * report for the initial download.
 *
 * Everything degrades gracefully: if the WASM build cannot start (old browser,
 * blocked asset, out of memory) the caller can fall back to `fallback.ts`.
 */

import manifest from '@/generated/engine-manifest.json';
import {
  parseBestMove,
  parseInfoLine,
  parseOptionLine,
  splitEngineMessages,
  type BestMove,
  type EngineInfo,
  type UciOption,
} from './uci';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'searching' | 'error';

export interface EngineProgress {
  percent: number;
  loaded: number;
  total: number;
  speedText?: string;
}

export interface SearchLimits {
  depth?: number;
  movetimeMs?: number;
  nodes?: number;
  infinite?: boolean;
}

export interface SearchRequest {
  /** Full UCI position command, e.g. `position startpos moves e2e4`. */
  position: string;
  limits: SearchLimits;
  /** Overrides the MultiPV option for this search only. */
  multiPv?: number;
}

export interface SearchResult {
  bestMove: string | null;
  ponder?: string;
  /** Deepest line per MultiPV index, best first. */
  lines: EngineInfo[];
  elapsedMs: number;
  /** True when the search was cut short by `stop()`. */
  stopped: boolean;
}

export interface EngineClientOptions {
  workerUrl?: string;
  wasmUrl?: string;
  /** Skip the main-thread preload (used by tests). */
  preload?: boolean;
  onLine?: (line: string) => void;
  onInfo?: (info: EngineInfo) => void;
  onProgress?: (progress: EngineProgress) => void;
  onStatus?: (status: EngineStatus) => void;
  onError?: (error: Error) => void;
}

const HANDSHAKE_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 20_000;

/**
 * Streams the wasm binary on the main thread so we can show a real progress
 * bar. The worker's own fetch then hits the HTTP cache (`immutable` headers),
 * so the asset is only transferred once.
 */
export async function preloadEngineWasm(
  url: string,
  onProgress: (progress: EngineProgress) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok || !response.body) return false;
    const total = Number(response.headers.get('content-length')) || manifest.wasmBytes;
    const reader = response.body.getReader();
    let loaded = 0;
    const startedAt = Date.now();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value?.byteLength ?? 0;
      const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.001);
      const speed = loaded / elapsed;
      onProgress({
        percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        loaded,
        total,
        speedText: speed > 1048576 ? `${(speed / 1048576).toFixed(1)} MB/s` : `${Math.round(speed / 1024)} KB/s`,
      });
    }
    return true;
  } catch {
    // Offline or aborted: let the worker try anyway.
    return false;
  }
}

interface Pending {
  resolve: (result: SearchResult) => void;
  info: EngineInfo[];
  startedAt: number;
  /** Safety net timer; cleared whenever the search settles. */
  timeout: ReturnType<typeof setTimeout>;
}

function settle(pending: Pending, result: SearchResult) {
  clearTimeout(pending.timeout);
  pending.resolve(result);
}

export class EngineClient {
  private worker: Worker | null = null;
  private options = new Map<string, UciOption>();
  private waiters = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private pending: Pending | null = null;
  private queue: (() => void)[] = [];
  private statusValue: EngineStatus = 'idle';
  private readonly opts: EngineClientOptions;

  constructor(options: EngineClientOptions = {}) {
    this.opts = options;
  }

  get status(): EngineStatus {
    return this.statusValue;
  }

  get supportedOptions(): Map<string, UciOption> {
    return this.options;
  }

  private setStatus(status: EngineStatus) {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.opts.onStatus?.(status);
  }

  private fail(error: Error) {
    this.setStatus('error');
    this.opts.onError?.(error);
    if (this.pending) {
      settle(this.pending, { bestMove: null, lines: [], elapsedMs: 0, stopped: true });
      this.pending = null;
    }
    // Reject anything still waiting on the protocol.
    for (const [, waiter] of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
  }

  /** Waits for a specific protocol token (`uciok`, `readyok`, ...). */
  private waitFor(token: string, timeoutMs = READY_TIMEOUT_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(token);
        reject(new Error(`engine timeout waiting for "${token}"`));
      }, timeoutMs);
      this.waiters.set(token, { resolve, reject, timer });
    });
  }

  private handleMessage(raw: unknown) {
    // WASM download progress is posted as an object, not a string.
    if (raw && typeof raw === 'object' && 'percent' in (raw as Record<string, unknown>)) {
      const p = raw as EngineProgress;
      this.opts.onProgress?.(p);
      return;
    }
    if (typeof raw !== 'string') return;

    for (const line of splitEngineMessages(raw)) {
      this.opts.onLine?.(line);

      if (line === 'uciok' || line === 'readyok') {
        const waiter = this.waiters.get(line);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.waiters.delete(line);
          waiter.resolve();
        }
        continue;
      }

      const option = parseOptionLine(line);
      if (option) {
        this.options.set(option.name, option);
        continue;
      }

      const info = parseInfoLine(line);
      if (info) {
        if (this.pending) this.pending.info.push(info);
        this.opts.onInfo?.(info);
        continue;
      }

      const best: BestMove | null = parseBestMove(line);
      if (best) {
        const pending = this.pending;
        this.pending = null;
        // `bestmove (none)` happens in terminal positions.
        const move = !best.move || best.move === '(none)' ? null : best.move;
        if (pending) {
          settle(pending, {
            bestMove: move,
            ponder: best.ponder,
            lines: groupLines(pending.info),
            elapsedMs: Date.now() - pending.startedAt,
            stopped: false,
          });
        }
        this.setStatus('ready');
        this.drainQueue();
      }
    }
  }

  private drainQueue() {
    const next = this.queue.shift();
    next?.();
  }

  /** Boots the worker and completes the UCI handshake. */
  async start(): Promise<void> {
    if (this.worker) return;
    if (typeof Worker === 'undefined') {
      this.fail(new Error('Web Workers are not available in this environment'));
      return;
    }
    this.setStatus('loading');
    const workerUrl = this.opts.workerUrl ?? manifest.workerUrl;
    const wasmUrl = this.opts.wasmUrl ?? manifest.wasmUrl;

    if (this.opts.preload !== false) {
      await preloadEngineWasm(wasmUrl, p => this.opts.onProgress?.(p));
    }

    try {
      this.worker = new Worker(workerUrl);
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    this.worker.onerror = event => {
      this.fail(new Error(`engine worker error: ${event.message || 'unknown'}`));
    };
    this.worker.onmessageerror = () => this.fail(new Error('engine worker message could not be deserialized'));
    this.worker.onmessage = event => this.handleMessage(event.data);

    try {
      const uciOk = this.waitFor('uciok', HANDSHAKE_TIMEOUT_MS);
      this.send('uci');
      await uciOk;
      const readyOk = this.waitFor('readyok');
      this.send('isready');
      await readyOk;
      this.setStatus('ready');
    } catch (err) {
      this.worker?.terminate();
      this.worker = null;
      this.fail(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  /** Applies raw `setoption ...` lines and waits until they took effect. */
  async setOptionLines(lines: string[]): Promise<void> {
    if (!this.worker || !lines.length) return;
    const readyOk = this.waitFor('readyok');
    for (const line of lines) this.send(line);
    this.send('isready');
    await readyOk;
  }

  async setOption(name: string, value: string | number | boolean): Promise<void> {
    const normalized = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    await this.setOptionLines([`setoption name ${name} value ${normalized}`]);
  }

  async newGame(): Promise<void> {
    if (!this.worker) return;
    const readyOk = this.waitFor('readyok');
    this.send('ucinewgame');
    this.send('isready');
    await readyOk;
  }

  /** Cancels the running search; the promise resolves with `stopped: true`. */
  stop(): void {
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      this.send('stop');
      settle(pending, {
        bestMove: null,
        lines: groupLines(pending.info),
        elapsedMs: Date.now() - pending.startedAt,
        stopped: true,
      });
    }
  }

  /**
   * Runs one search. Searches are serialized: calling this while a search is
   * running cancels that one first (the UI never wants two searches at once).
   */
  async search(request: SearchRequest): Promise<SearchResult> {
    if (!this.worker || this.statusValue === 'error') {
      throw new Error('engine is not ready');
    }
    if (this.pending) this.stop();
    if (this.pending) {
      // Wait for the previous search's promise to settle before sending `go`.
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    const multiPv = request.multiPv;
    if (multiPv && this.options.has('MultiPV')) {
      this.send(`setoption name MultiPV value ${multiPv}`);
    }
    this.send(request.position);

    const goParts = ['go'];
    if (request.limits.depth) goParts.push('depth', String(request.limits.depth));
    if (request.limits.nodes) goParts.push('nodes', String(request.limits.nodes));
    if (request.limits.movetimeMs) goParts.push('movetime', String(request.limits.movetimeMs));
    if (request.limits.infinite) goParts.push('infinite');

    const budget = (request.limits.movetimeMs ?? 1000) * 6 + 10_000;
    const timeout = setTimeout(() => {
      if (this.pending) {
        this.stop();
        this.opts.onError?.(new Error('engine search timed out'));
      }
    }, budget);

    const result = new Promise<SearchResult>(resolve => {
      this.pending = { resolve, info: [], startedAt: Date.now(), timeout };
    });

    this.setStatus('searching');
    this.send(goParts.join(' '));
    return result;
  }

  dispose(): void {
    try {
      this.send('quit');
    } catch {
      // ignore
    }
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
    this.queue = [];
    this.setStatus('idle');
  }
}

/** Keeps the deepest line for each MultiPV index, best (lowest index) first. */
function groupLines(infos: EngineInfo[]): EngineInfo[] {
  const byIndex = new Map<number, EngineInfo>();
  for (const info of infos) {
    if (!info.pv.length) continue;
    const prev = byIndex.get(info.multipv);
    if (!prev || info.depth >= prev.depth) byIndex.set(info.multipv, info);
  }
  return [...byIndex.values()].sort((a, b) => a.multipv - b.multipv);
}

export { manifest as engineManifest };
