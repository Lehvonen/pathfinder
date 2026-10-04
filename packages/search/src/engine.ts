import type { Category } from '@pathfinder/core';
import { createCategoryIndex } from './categories';
import { buildHaystack, CHUNK_SIZE, yieldToMain, type Haystack, type YieldFn } from './haystack';
import { parseQuery, prepareAliases, type ParsedQuery } from './query';
import { scan } from './scan';
import type {
  Aliases,
  CategoryHit,
  CategoryRank,
  CategoryTop,
  Cursor,
  ProductHit,
  ProductRef,
  SearchResponse,
  TierData,
  TierNumber,
} from './types';

/** Results per page: the visible list, and what "show more" adds. */
export const PAGE_SIZE = 20;
/** Example products shown under a category result. */
export const CATEGORY_EXAMPLES = 3;

const TIERS: readonly TierNumber[] = [1, 2, 3];

export type SearchEngineInput = {
  categories: readonly Category[];
  categoryTop: CategoryTop;
  categoryRank: CategoryRank;
  aliases: Aliases;
  /** How to give the main thread back between chunks; tests pass a no-op. */
  yieldFn?: YieldFn;
};

export type SearchEngine = {
  /** Makes a tier searchable, in chunks; resolves once it is. Tiers may arrive in any order. */
  addTier(data: TierData): Promise<void>;
  search(raw: string, limit?: number): SearchResponse;
  /** Continues a `search` from its cursor. */
  searchMore(raw: string, cursor: Cursor, limit?: number): SearchResponse;
  /** Products of one category and its descendants; an empty query lists them all. */
  searchWithin(categoryId: number, raw: string, limit?: number, cursor?: Cursor): SearchResponse;
  /** Increments whenever a tier lands, so a UI knows to re-run the current query. */
  getVersion(): number;
  subscribe(listener: () => void): () => void;
};

type LoadedTier = { data: TierData; haystack: Haystack };

export function createSearchEngine(input: SearchEngineInput): SearchEngine {
  const { categoryTop, yieldFn = yieldToMain } = input;
  const aliases = prepareAliases(input.aliases);
  const categoryIndex = createCategoryIndex(input.categories, input.categoryRank);
  const tiers = new Map<TierNumber, LoadedTier>();
  const byEan = new Map<string, ProductRef>();
  const listeners = new Set<() => void>();
  let version = 0;

  const addTier = async (data: TierData) => {
    const haystack = await buildHaystack(data.names, yieldFn);
    for (let i = 0; i < data.eans.length; i++) {
      if (i > 0 && i % CHUNK_SIZE === 0) await yieldFn();
      byEan.set(data.eans[i]!, refAt(data, i));
    }
    tiers.set(data.tier, { data, haystack });
    version += 1;
    for (const listener of listeners) listener();
  };

  const pendingTiers = () => TIERS.filter((tier) => !tiers.has(tier));

  /** Scans tier by tier from `cursor`; stops at a tier that is not loaded yet, so a
   * later tier's results never appear above a missing earlier one. */
  const collect = (
    query: ParsedQuery,
    cursor: Cursor,
    limit: number,
    categoryFilter?: (categoryId: number) => boolean,
  ): Pick<SearchResponse, 'products' | 'cursor'> => {
    const products: ProductHit[] = [];
    let { tier, next } = cursor;
    for (;;) {
      const loaded = tiers.get(tier);
      if (!loaded || products.length === limit) return { products, cursor: { tier, next } };
      const { data, haystack } = loaded;
      const filter = categoryFilter && ((i: number) => categoryFilter(data.categoryIds[i]!));
      const result = scan(haystack, query, next, limit - products.length, filter);
      for (const i of result.items) products.push({ kind: 'product', ...refAt(data, i), tier });
      if (result.next !== null) return { products, cursor: { tier, next: result.next } };
      if (tier === 3) return { products, cursor: null };
      tier = (tier + 1) as TierNumber;
      next = 0;
    }
  };

  const respond = (raw: string, categories: CategoryHit[], found: ReturnType<typeof collect>) => ({
    query: raw,
    categories,
    ...found,
    pendingTiers: pendingTiers(),
  });

  const categoryHits = (query: ParsedQuery): CategoryHit[] =>
    categoryIndex.match(query).map((category) => ({
      kind: 'category',
      category,
      topProducts: (categoryTop[category.id] ?? [])
        .map((ean) => byEan.get(ean))
        .filter((ref) => ref !== undefined)
        .slice(0, CATEGORY_EXAMPLES),
    }));

  const start: Cursor = { tier: 1, next: 0 };

  return {
    addTier,
    search(raw, limit = PAGE_SIZE) {
      const query = parseQuery(raw, aliases);
      if (query.isEmpty) return respond(raw, [], { products: [], cursor: null });
      return respond(raw, categoryHits(query), collect(query, start, limit));
    },
    searchMore(raw, cursor, limit = PAGE_SIZE) {
      return respond(raw, [], collect(parseQuery(raw, aliases), cursor, limit));
    },
    searchWithin(categoryId, raw, limit = PAGE_SIZE, cursor = start) {
      const mask = categoryIndex.subtreeMask(categoryId);
      const inCategory = (id: number) => mask[id] === 1;
      return respond(raw, [], collect(parseQuery(raw, aliases), cursor, limit, inCategory));
    },
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function refAt(data: TierData, i: number): ProductRef {
  return { ean: data.eans[i]!, name: data.names[i]!, categoryId: data.categoryIds[i]! };
}
