'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EngineClient, type EngineProgress, type EngineStatus, type SearchLimits, type SearchResult } from './client';
import type { EngineInfo, UciOption } from './uci';

/**
 * One shared engine worker for the whole app.
 *
 * A WASM engine costs ~1.7MB of download plus a worker thread, so creating one
 * per screen would be wasteful. The provider keeps a single client alive.
 *
 * Important: `search`, `setOptions`, `newGame`, `stop` and `restart` have
 * *stable identities* (empty dependency arrays). Consumers must be able to put
 * them in `useEffect` dependency lists without restarting a search every time a
 * purely visual value (like the live evaluation) changes.
 */

export interface EngineActions {
  search: (position: string, limits: SearchLimits, multiPv?: number) => Promise<SearchResult>;
  setOptions: (lines: string[]) => Promise<void>;
  newGame: () => Promise<void>;
  stop: () => void;
  restart: () => void;
}

export interface EngineState {
  status: EngineStatus;
  progress: EngineProgress | null;
  ready: boolean;
  failed: boolean;
  loading: boolean;
  /** Latest streamed info line (live evaluation while thinking). */
  liveInfo: EngineInfo | null;
  supportedOptions: Map<string, UciOption>;
}

export type EngineApi = EngineActions & EngineState;

const EngineActionsContext = createContext<EngineActions | null>(null);
const EngineStateContext = createContext<EngineState | null>(null);

export function EngineProvider({
  children,
  enabled = true,
  workerUrl,
}: {
  children: ReactNode;
  enabled?: boolean;
  workerUrl?: string;
}) {
  const clientRef = useRef<EngineClient | null>(null);
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [liveInfo, setLiveInfo] = useState<EngineInfo | null>(null);
  const [supportedOptions, setSupportedOptions] = useState<Map<string, UciOption>>(new Map());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const client = new EngineClient({
      workerUrl,
      onStatus: setStatus,
      onProgress: setProgress,
      onInfo: info => {
        // Keep the deepest line so the eval bar does not jitter.
        setLiveInfo(prev => (!prev || info.depth >= prev.depth ? info : prev));
      },
    });
    clientRef.current = client;
    let disposed = false;
    void client
      .start()
      .then(() => {
        if (!disposed) setSupportedOptions(new Map(client.supportedOptions));
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      client.dispose();
      clientRef.current = null;
    };
  }, [enabled, workerUrl, attempt]);

  const search = useCallback<EngineActions['search']>(async (position, limits, multiPv) => {
    const client = clientRef.current;
    if (!client) throw new Error('engine not available');
    return client.search({ position, limits, multiPv });
  }, []);

  const setOptions = useCallback<EngineActions['setOptions']>(async lines => {
    await clientRef.current?.setOptionLines(lines);
  }, []);

  const newGame = useCallback<EngineActions['newGame']>(async () => {
    await clientRef.current?.newGame();
  }, []);

  const stop = useCallback(() => {
    clientRef.current?.stop();
  }, []);

  const restart = useCallback(() => {
    clientRef.current?.dispose();
    clientRef.current = null;
    setStatus('idle');
    setProgress(null);
    setLiveInfo(null);
    setAttempt(value => value + 1);
  }, []);

  const actions = useMemo<EngineActions>(
    () => ({ search, setOptions, newGame, stop, restart }),
    [newGame, restart, search, setOptions, stop],
  );

  const state = useMemo<EngineState>(
    () => ({
      status,
      progress,
      ready: status === 'ready' || status === 'searching',
      failed: status === 'error',
      loading: status === 'loading' || status === 'idle',
      liveInfo,
      supportedOptions,
    }),
    [status, progress, liveInfo, supportedOptions],
  );

  return (
    <EngineActionsContext.Provider value={actions}>
      <EngineStateContext.Provider value={state}>{children}</EngineStateContext.Provider>
    </EngineActionsContext.Provider>
  );
}

/** Stable actions only — safe to use in effect dependency lists. */
export function useEngineActions(): EngineActions {
  const ctx = useContext(EngineActionsContext);
  if (!ctx) throw new Error('useEngineActions must be used inside <EngineProvider>');
  return ctx;
}

/** Reactive engine state (status, progress, live eval). */
export function useEngineState(): EngineState {
  const ctx = useContext(EngineStateContext);
  if (!ctx) throw new Error('useEngineState must be used inside <EngineProvider>');
  return ctx;
}

export function useEngine(): EngineApi {
  return { ...useEngineActions(), ...useEngineState() };
}
