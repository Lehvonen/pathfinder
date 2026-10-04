// Public data shapes of the search engine (docs/plans/search.md §3, §6). Derived from
// the core contract where they overlap, so a change to `Product` or `Category` reaches
// search without a second definition.
import type { Category, Product } from '@pathfinder/core';

export type TierNumber = 1 | 2 | 3;

/** What search knows about a product: enough to render and add it, nothing more. */
export type ProductRef = Pick<Product, 'ean' | 'name' | 'categoryId'>;

/**
 * One tier file (`search-tier-N.json`). Columnar: index `i` of each array is one
 * product. Arrays are in final rank order, so popularity itself is not shipped.
 */
export type TierData = {
  version: 1;
  tier: TierNumber;
  eans: string[];
  names: string[];
  categoryIds: number[];
};

/** `aliases.json`: a query word → the terms it means. The word itself is not implied. */
export type Aliases = Record<string, string[]>;

/** `category-top.json`: category id → top EANs of its subtree, in rank order. */
export type CategoryTop = Record<number, string[]>;

/** `category-rank.json`: category id → rank of its best product (0 = most popular). */
export type CategoryRank = Record<number, number>;

export type ProductHit = ProductRef & { kind: 'product'; tier: TierNumber };

export type CategoryHit = {
  kind: 'category';
  category: Category;
  /** Top products of the category, only those whose tier is loaded. */
  topProducts: ProductRef[];
};

/** A folded term the query matched, for highlighting it in a product name. */
export type MatchTerm = { term: string; wordStart: boolean };

/** Where "show more" continues: the next index to scan in `tier`. */
export type Cursor = { tier: TierNumber; next: number };

export type SearchResponse = {
  /** The raw query this answers, so a stale response can be recognised. */
  query: string;
  /** At most 3, most specific first. Never set by `searchMore` or `searchWithin`. */
  categories: CategoryHit[];
  /** Tier 1 results first, then tier 2, then tier 3. */
  products: ProductHit[];
  /** Tiers not loaded yet: more results may follow when they arrive. */
  pendingTiers: TierNumber[];
  /** `null` means there is nothing more to show, ever. */
  cursor: Cursor | null;
  /** Every term the products were matched on, aliases included, to highlight them. */
  terms: MatchTerm[];
  /** Set when typo correction ran: the response is for `to`, not what was typed. */
  corrected?: { from: string; to: string };
};
