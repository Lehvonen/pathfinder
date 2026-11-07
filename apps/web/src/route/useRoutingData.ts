import { useCallback, useEffect, useState } from 'react';
import { loadRoutingData, type LoadedRouting } from './loadRoutingData';

export type RoutingDataState = {
  /** `null` until all four routing files have loaded. */
  routing: LoadedRouting | null;
  error: Error | null;
  /** Loads again after a failure, without a page reload, which would leave the route. */
  retry(): void;
};

/**
 * Loads the routing data once `enabled` turns true. The app enables it once search is
 * ready, so its 230 KB never compete with the first search files (ARCHITECTURE.md §14), and
 * it is still usually ready before the list is. The loading itself is in `loadRoutingData`,
 * which is tested; this hook only connects it to React.
 */
export function useRoutingData(
  enabled = true,
  load: () => Promise<LoadedRouting> = loadRoutingData,
): RoutingDataState {
  const [state, setState] = useState<Omit<RoutingDataState, 'retry'>>({
    routing: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load().then(
      (routing) => {
        if (active) setState({ routing, error: null });
      },
      (cause: unknown) => {
        if (active) {
          setState({
            routing: null,
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, load, attempt]);

  const retry = useCallback(() => {
    setState({ routing: null, error: null });
    setAttempt((count) => count + 1);
  }, []);

  return { ...state, retry };
}
