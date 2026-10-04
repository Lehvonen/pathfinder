import type { SearchEngine } from '@pathfinder/search';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadBase, loadTier } from './loadSearchData';
import { startSearchEngine, whenIdle, type SearchLoader } from './startSearchEngine';

const LOADER: SearchLoader = {
  loadBase: () => loadBase(),
  loadTier: (tier) => loadTier(tier),
  whenIdle,
};

export type SearchEngineState = {
  /** `null` until tier 1 is searchable. */
  engine: SearchEngine | null;
  /** Changes whenever a tier lands; pass it to anything that should re-run the query. */
  version: number;
  error: Error | null;
};

const noSubscription = () => () => {};

/**
 * Starts loading search once and keeps the component in step with it. The order lives
 * in `startSearchEngine`, which is tested; this hook only connects it to React.
 */
export function useSearchEngine(loader: SearchLoader = LOADER): SearchEngineState {
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    const start = startSearchEngine(loader, setEngine);
    start.finished.catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause : new Error(String(cause)));
    });
    return () => {
      active = false;
      start.cancel();
    };
  }, [loader]);

  const version = useSyncExternalStore(
    engine?.subscribe ?? noSubscription,
    () => engine?.getVersion() ?? 0,
  );
  return { engine, version, error };
}
