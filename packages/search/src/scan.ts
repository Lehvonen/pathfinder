import { itemAt, type Haystack } from './haystack';
import type { ParsedQuery } from './query';

export type ScanResult = {
  /** Matching item indexes, in haystack order, which is rank order. */
  items: number[];
  /** Where to resume for the next page; `null` when the tier has nothing left. */
  next: number | null;
};

type Cursor = { needle: string; item: number };

/**
 * Finds the first `limit` items from `from` that match every slot of `query`
 * (docs/plans/search.md §5.3). Items are stored in rank order, so these are the top
 * `limit` results and the scan stops there.
 *
 * Leapfrog: every alternative of every slot keeps a cursor at its next occurrence, and
 * a cursor only ever moves forward. The candidate item is the furthest any slot's
 * nearest occurrence has reached; slots behind it seek straight to it. So a query costs
 * at most one pass per alternative, and a rare word ends the scan quickly instead of
 * being re-checked for every match of a common one.
 *
 * An empty query matches every item; `filter` rejects items without ending the scan.
 */
export function scan(
  haystack: Haystack,
  query: ParsedQuery,
  from: number,
  limit: number,
  filter?: (item: number) => boolean,
): ScanResult {
  const slots: Cursor[][] = query.slots.map((slot) =>
    slot.alternatives.map(({ needle }) => ({ needle, item: -1 })),
  );
  const seek = (cursor: Cursor, fromItem: number) => {
    const position = haystack.text.indexOf(cursor.needle, haystack.starts[fromItem]);
    cursor.item = position === -1 ? Infinity : itemAt(haystack, position);
  };

  const items: number[] = [];
  let candidate = from;
  for (;;) {
    if (candidate >= haystack.size) return { items, next: null };
    // Move every slot up to the candidate until all of them meet on one item.
    let aligned = false;
    while (!aligned) {
      aligned = true;
      for (const cursors of slots) {
        let nearest = Infinity;
        for (const cursor of cursors) {
          if (cursor.item < candidate) seek(cursor, candidate);
          nearest = Math.min(nearest, cursor.item);
        }
        if (nearest === Infinity) return { items, next: null };
        if (nearest > candidate) {
          candidate = nearest;
          aligned = false;
        }
      }
    }
    if (!filter || filter(candidate)) {
      items.push(candidate);
      if (items.length === limit) {
        const next = candidate + 1;
        return { items, next: next < haystack.size ? next : null };
      }
    }
    candidate += 1;
  }
}
