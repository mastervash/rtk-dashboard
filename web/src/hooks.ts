import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommandRow } from './api';

type AsyncState<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Fetch-on-dependency-change with a stale-response guard. `deps` is the cache
 * key; `revision` lets the live stream force a refetch.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & {
  reload: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fnRef
      .current()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((err) => live && setState({ data: null, error: String(err.message ?? err), loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export type LiveState = {
  connected: boolean;
  /** Bumps whenever new rows land — use it as a refetch dependency. */
  revision: number;
  recent: CommandRow[];
  lastEventAt: number | null;
};

/** Subscribes to /api/stream and keeps a rolling buffer of the newest rows. */
export function useLiveStream(enabled: boolean, bufferSize = 40): LiveState {
  const [state, setState] = useState<LiveState>({
    connected: false,
    revision: 0,
    recent: [],
    lastEventAt: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, connected: false }));
      return;
    }
    const es = new EventSource('/api/stream');

    es.addEventListener('hello', () => setState((s) => ({ ...s, connected: true })));
    es.addEventListener('commands', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { rows: CommandRow[] };
      if (!payload.rows?.length) return;
      setState((s) => ({
        connected: true,
        revision: s.revision + 1,
        recent: [...payload.rows.slice().reverse(), ...s.recent].slice(0, bufferSize),
        lastEventAt: Date.now(),
      }));
    });
    es.onerror = () => setState((s) => ({ ...s, connected: false }));

    return () => es.close();
  }, [enabled, bufferSize]);

  return state;
}

/** Persists a value in localStorage so view preferences survive reloads. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`rtkdash:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`rtkdash:${key}`, JSON.stringify(value));
    } catch {
      /* quota or private mode — preference just won't persist */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
