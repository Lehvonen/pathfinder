import { useEffect, useState } from 'react';
import { loadRoutingData, type LoadedRouting } from './loadRoutingData';

export type RoutingDataState = {
  /** `null` until all four routing files have loaded. */
  routing: LoadedRouting | null;
  error: Error | null;
};

/**
 * Starts loading the routing data once, when the app opens, so it is usually ready before
 * the list is: "Laske reitti" then answers at once. The loading itself is in
 * `loadRoutingData`, which is tested; this hook only connects it to React.
 */
export function useRoutingData(
  load: () => Promise<LoadedRouting> = loadRoutingData,
): RoutingDataState {
  const [state, setState] = useState<RoutingDataState>({ routing: null, error: null });

  useEffect(() => {
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
  }, [load]);

  return state;
}
