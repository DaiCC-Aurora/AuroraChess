import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from './client';

/**
 * The UCI client is the piece that cannot be exercised in the engine smoke test
 * (that one speaks to the engine directly), so a fake Worker stands in for the
 * real WASM worker here: same message shapes, deterministic timing.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  /** When false, `go` gets no reply so cancellation can be tested. */
  static autoRespond = true;

  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: string[] = [];
  terminated = false;

  constructor(readonly url: string) {
    FakeWorker.instances.push(this);
  }

  emit(payload: string) {
    this.onmessage?.({ data: payload });
  }

  postMessage(message: unknown) {
    const command = String(message);
    this.posted.push(command);
    const respond = (payload: string) => setTimeout(() => this.emit(payload), 0);

    if (command === 'uci') {
      respond(
        [
          'id name Stockfish Fake',
          'option name UCI_LimitStrength type check default false',
          'option name UCI_Elo type spin default 1320 min 1320 max 3190',
          'option name Skill Level type spin default 20 min 0 max 20',
          'option name MultiPV type spin default 1 min 1 max 256',
          'uciok',
        ].join('\n'),
      );
      return;
    }
    if (command === 'isready') {
      respond('readyok');
      return;
    }
    if (command.startsWith('go') && FakeWorker.autoRespond) {
      respond('info depth 1 multipv 1 score cp 20 nodes 100 pv e2e4');
      respond('info depth 8 multipv 1 score cp 35 nodes 9000 pv e2e4 e7e5');
      respond('info depth 8 multipv 2 score cp 10 nodes 9000 pv d2d4 d7d5');
      respond('bestmove e2e4 ponder e7e5');
    }
  }

  terminate() {
    this.terminated = true;
  }
}

const globalWithWorker = globalThis as unknown as { Worker?: unknown };

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.autoRespond = true;
  globalWithWorker.Worker = FakeWorker;
});

afterEach(() => {
  delete globalWithWorker.Worker;
  vi.restoreAllMocks();
});

describe('EngineClient', () => {
  const create = (options = {}) => new EngineClient({ preload: false, ...options });

  it('completes the UCI handshake and records the supported options', async () => {
    const client = create();
    const statuses: string[] = [];
    const client2 = new EngineClient({
      preload: false,
      onStatus: status => statuses.push(status),
    });
    void client;

    await client2.start();
    expect(client2.status).toBe('ready');
    expect(statuses).toContain('loading');
    expect(statuses).toContain('ready');

    const eloOption = client2.supportedOptions.get('UCI_Elo');
    expect(eloOption).toMatchObject({ type: 'spin', min: 1320, max: 3190 });
    expect(client2.supportedOptions.has('Skill Level')).toBe(true);
    expect(FakeWorker.instances[0].posted).toContain('uci');
    client2.dispose();
  });

  it('returns the best move together with the deepest MultiPV lines', async () => {
    const client = create();
    await client.start();
    const result = await client.search({ position: 'position startpos', limits: { depth: 8 } });

    expect(result.bestMove).toBe('e2e4');
    expect(result.ponder).toBe('e7e5');
    expect(result.stopped).toBe(false);
    // Two MultiPV indices, deepest entry each, ordered by index.
    expect(result.lines.map(line => line.multipv)).toEqual([1, 2]);
    expect(result.lines[0].depth).toBe(8);
    expect(result.lines[0].score).toEqual({ type: 'cp', value: 35, bound: undefined });
    expect(result.lines[0].pv).toEqual(['e2e4', 'e7e5']);
    client.dispose();
  });

  it('sends setoption lines and waits for readiness', async () => {
    const client = create();
    await client.start();
    await client.setOption('UCI_Elo', 1500);
    const posted = FakeWorker.instances[0].posted;
    expect(posted).toContain('setoption name UCI_Elo value 1500');
    expect(posted.filter(command => command === 'isready').length).toBeGreaterThanOrEqual(2);
    client.dispose();
  });

  it('resolves a cancelled search as stopped', async () => {
    const client = create();
    await client.start();
    FakeWorker.autoRespond = false;
    const pending = client.search({ position: 'position startpos', limits: { movetimeMs: 50 } });
    expect(client.status).toBe('searching');
    await new Promise(resolve => setTimeout(resolve, 5));
    client.stop();
    const result = await pending;
    expect(result.stopped).toBe(true);
    expect(result.bestMove).toBeNull();
    expect(FakeWorker.instances[0].posted).toContain('stop');
    client.dispose();
  });

  it('treats bestmove (none) as no move', async () => {
    const client = create();
    await client.start();
    FakeWorker.autoRespond = false;
    const pending = client.search({ position: 'position startpos', limits: { movetimeMs: 50 } });
    await new Promise(resolve => setTimeout(resolve, 5));
    FakeWorker.instances[0].emit('bestmove (none)');
    const result = await pending;
    expect(result.bestMove).toBeNull();
    client.dispose();
  });

  it('forwards download progress objects', async () => {
    const onProgress = vi.fn();
    const client = create({ onProgress });
    await client.start();
    FakeWorker.instances[0].emit('info depth 1 score cp 0 pv e2e4');
    FakeWorker.instances[0].onmessage?.({ data: { percent: 42, loaded: 42, total: 100 } });
    expect(onProgress).toHaveBeenCalledWith({ percent: 42, loaded: 42, total: 100 });
    client.dispose();
  });

  it('reports an error when Web Workers are unavailable', async () => {
    delete globalWithWorker.Worker;
    const onError = vi.fn();
    const client = create({ onError });
    await client.start();
    expect(client.status).toBe('error');
    expect(onError).toHaveBeenCalled();
    await expect(client.search({ position: 'position startpos', limits: { depth: 1 } })).rejects.toThrow();
  });
});
