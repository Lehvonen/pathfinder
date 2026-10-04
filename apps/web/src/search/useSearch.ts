import { PAGE_SIZE, type SearchEngine, type SearchResponse } from '@pathfinder/search';
import { useDeferredValue, useMemo, useState } from 'react';

export type SearchState = {
  /** What is in the input, updated on every keystroke without waiting for results. */
  query: string;
  setQuery(query: string): void;
  /** Results for the latest query React has had time for; `null` before tier 1. */
  response: SearchResponse | null;
  canShowMore: boolean;
  showMore(): void;
};

/**
 * Query state for the search screen (docs/plans/search.md §5). The input stays instant:
 * results are computed from a deferred copy of the query, so React can skip a render
 * when typing outpaces it. The list shows 20 rows, "show more" adds 20, and a new query
 * starts again at 20. When a tier lands, `version` changes and the same query re-runs
 * with the same row count, so the list only grows.
 */
export function useSearch(engine: SearchEngine | null, version: number): SearchState {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  // The row count belongs to one query; a different query starts again at one page.
  const [rows, setRows] = useState({ query: '', count: PAGE_SIZE });
  const count = rows.query === deferred ? rows.count : PAGE_SIZE;

  const response = useMemo(
    () => runSearch(engine, deferred, count, version),
    [engine, deferred, count, version],
  );

  return {
    query,
    setQuery,
    response,
    canShowMore: canShowMore(response),
    showMore: () => setRows({ query: deferred, count: count + PAGE_SIZE }),
  };
}

/**
 * One search. `version` is unused by the engine call; it is an argument so the memo above
 * depends on it honestly and a new tier re-runs the query.
 */
export function runSearch(
  engine: SearchEngine | null,
  query: string,
  count: number,
  version: number,
): SearchResponse | null {
  void version;
  return engine ? engine.search(query, count) : null;
}

/** More rows exist now: the scan stopped at the row count, not at a tier still loading
 * (that tier's rows arrive on their own when it lands). */
export function canShowMore(response: SearchResponse | null): boolean {
  if (!response?.cursor) return false;
  return !response.pendingTiers.includes(response.cursor.tier);
}
