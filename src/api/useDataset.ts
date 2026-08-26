import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Run a promise-returning loader and track its state.
 *
 * Deliberately small: the loaders in datasets.ts already de-duplicate and cache,
 * so all this needs to do is subscribe, ignore results from a request the user
 * has already navigated away from, and surface an error the UI can render.
 *
 * `deps` identifies the request. Change it and the previous result is dropped.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    load().then(
      (data) => {
        if (active) setState({ data, loading: false, error: null });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );

    return () => {
      active = false;
    };
    // `load` is recreated on every render by design; `deps` is the real key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
