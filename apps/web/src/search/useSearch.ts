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
 * when typing outpaces it. The list shows 20 rows, "show more" adds 20, and every change
 * of the query starts again at 20, even back to an earlier one. When a tier lands,
 * `version` changes and the same query re-runs with the same row count, so the list only
 * grows.
 *
 * With `categoryId`, it searches that category and its sub-categories only, and an empty
 * query lists all of their products (the category page).
 */
export function useSearch(
  engine: SearchEngine | null,
  version: number,
  categoryId?: number,
): SearchState {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [stored, setStored] = useState<Rows>(() => firstRows(deferred, categoryId));
  const rows = rowsFor(stored, deferred, categoryId);
  // A new query or category forgets the old count right away, so going A → B → A starts A
  // at 20 again.
  if (rows !== stored) setStored(rows);
  const { count } = rows;

  const response = useMemo(
    () => runSearch(engine, deferred, count, version, categoryId),
    [engine, deferred, count, version, categoryId],
  );

  return {
    query,
    setQuery,
    response,
    canShowMore: canShowMore(response),
    showMore: () => setStored(nextRows(rows)),
  };
}

/** How many rows the list shows, and for which query in which category. */
export type Rows = { query: string; categoryId?: number; count: number };

/** One page of rows for `query` (inside `categoryId`, on a category page). */
export function firstRows(query: string, categoryId?: number): Rows {
  return { query, categoryId, count: PAGE_SIZE };
}

/** The same rows while the query and category are unchanged (same object, so nothing
 * re-renders); one page again as soon as either changes. */
export function rowsFor(rows: Rows, query: string, categoryId?: number): Rows {
  const same = rows.query === query && rows.categoryId === categoryId;
  return same ? rows : firstRows(query, categoryId);
}

/** "Show more": one more page of the same query. */
export function nextRows(rows: Rows): Rows {
  return { ...rows, count: rows.count + PAGE_SIZE };
}

/**
 * One search, store-wide or inside `categoryId`. `version` is unused by the engine call;
 * it is an argument so the memo above depends on it honestly and a new tier re-runs it.
 */
export function runSearch(
  engine: SearchEngine | null,
  query: string,
  count: number,
  version: number,
  categoryId?: number,
): SearchResponse | null {
  void version;
  if (!engine) return null;
  return categoryId === undefined
    ? engine.search(query, count)
    : engine.searchWithin(categoryId, query, count);
}

/** More rows exist now: the scan stopped at the row count, not at a tier still loading
 * (that tier's rows arrive on their own when it lands). */
export function canShowMore(response: SearchResponse | null): boolean {
  if (!response?.cursor) return false;
  return !response.pendingTiers.includes(response.cursor.tier);
}
