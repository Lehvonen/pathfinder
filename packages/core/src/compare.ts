import type { Product } from './types';

/**
 * Locale-independent string order for sorting output: the same input must give the same
 * files on every machine. Compares UTF-16 code units, the same order as the default
 * `Array.prototype.sort`, unlike `localeCompare`, whose order depends on the machine's
 * locale.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A product with its build-time popularity; `null` means unranked (§6). */
export type RankedProduct = Pick<Product, 'ean' | 'name'> & { popularity: number | null };

/**
 * The search rank order (docs/plans/search.md §5): ranked before unranked, popularity
 * descending, shorter name first, then EAN. A total order, so sorting is deterministic.
 */
export function compareProductRank(a: RankedProduct, b: RankedProduct): number {
  if (a.popularity !== b.popularity) {
    if (a.popularity === null) return 1;
    if (b.popularity === null) return -1;
    return b.popularity - a.popularity;
  }
  return a.name.length - b.name.length || compareStrings(a.ean, b.ean);
}
