import { itemAt, type Haystack } from './haystack';
import type { MatchMode, ParsedQuery } from './query';

export type ScanResult = {
  /** Matching item indexes, in haystack order, which is rank order. */
  items: number[];
  /** Where to resume for the next page; `null` when the tier has nothing left. */
  next: number | null;
};

type Cursor = { term: string; mode: MatchMode; item: number };

const SPACE = 32;
const NEWLINE = 10;

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
 * An empty query matches every item; `filter` and the query's `exclude` texts reject
 * items without ending the scan.
 */
export function scan(
  haystack: Haystack,
  query: ParsedQuery,
  from: number,
  limit: number,
  filter?: (item: number) => boolean,
): ScanResult {
  const { text, starts } = haystack;
  const slots: Cursor[][] = query.slots.map((slot) =>
    slot.alternatives.map(({ term, mode }) => ({ term, mode, item: -1 })),
  );
  const seek = (cursor: Cursor, fromItem: number) => {
    const start = starts[fromItem]!; // the item's leading space
    const { term, mode } = cursor;
    let position = text.indexOf(term, mode === 'anywhere' ? start : start + 1);
    // A word-start match needs a space before it, a whole-word match also a space or the
    // item's end after it. Searching for " " + term would stop at every space in the text,
    // the commonest character; the term itself is far rarer, so a short word that matches
    // nothing costs ~0.05 ms instead of ~2 ms.
    const misses = (at: number) => {
      if (mode === 'anywhere') return false;
      if (text.charCodeAt(at - 1) !== SPACE) return true;
      const after = text.charCodeAt(at + term.length);
      return mode === 'whole-word' && after !== SPACE && after !== NEWLINE;
    };
    while (position !== -1 && misses(position)) position = text.indexOf(term, position + 1);
    cursor.item = position === -1 ? Infinity : itemAt(haystack, position);
  };

  // Checked on matching items only, within the item's own text.
  const isExcluded = (item: number) => {
    if (query.exclude.length === 0) return false;
    const own = text.slice(starts[item], starts[item + 1]);
    return query.exclude.some((term) => own.includes(term));
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
    if (!isExcluded(candidate) && (!filter || filter(candidate))) {
      items.push(candidate);
      if (items.length === limit) {
        const next = candidate + 1;
        return { items, next: next < haystack.size ? next : null };
      }
    }
    candidate += 1;
  }
}
