import { describe, expect, it, vi } from 'vitest';
import { createSearchEngine, type SearchEngine } from './engine';
import { aliases, categories, categoryRank, categoryTop, ean, tiers } from './fixtures';
import type { SearchResponse, TierNumber } from './types';

const noYield = async () => {};

async function engineWith(...loaded: TierNumber[]): Promise<SearchEngine> {
  const engine = createSearchEngine({
    categories,
    categoryTop,
    categoryRank,
    aliases,
    yieldFn: noYield,
  });
  for (const tier of loaded) await engine.addTier(tiers[tier]);
  return engine;
}

const eans = (r: SearchResponse) => r.products.map((p) => p.ean);
const nums = (...n: number[]) => n.map(ean);

// "maito" matches eans 2, 3, 4, 8, 12 in tier 1; 13, 18 in tier 2; 22 in tier 3.
const tier1Milk = nums(2, 3, 4, 8, 12);
const tier2Milk = nums(13, 18);
const tier3Milk = nums(22);

describe('search across tiers', () => {
  it('returns no products, but a resumable cursor, before any tier is loaded', async () => {
    const r = (await engineWith()).search('maito');
    expect(r.products).toEqual([]);
    expect(r.pendingTiers).toEqual([1, 2, 3]);
    expect(r.cursor).toEqual({ tier: 1, next: 0 });
  });

  it('searches tier 1 and reports the tiers still loading', async () => {
    const r = (await engineWith(1)).search('maito');
    expect(eans(r)).toEqual(tier1Milk);
    expect(r.products[0]).toEqual({
      kind: 'product',
      ean: ean(2),
      name: 'Pirkka suomalainen kevytmaito 1l',
      categoryId: 3,
      tier: 1,
    });
    expect(r.pendingTiers).toEqual([2, 3]);
    expect(r.cursor).toEqual({ tier: 2, next: 0 });
  });

  it('only appends when a tier arrives: the same query keeps its earlier results', async () => {
    // Review blocker 3: a memo once hid new tiers until the next keystroke.
    const engine = await engineWith(1);
    const before = engine.search('maito');
    await engine.addTier(tiers[2]);
    const after = engine.search('maito');
    expect(eans(after).slice(0, before.products.length)).toEqual(eans(before));
    expect(eans(after)).toEqual([...tier1Milk, ...tier2Milk]);
  });

  it('never shows a later tier above a missing earlier one', async () => {
    const r = (await engineWith(1, 3)).search('maito');
    expect(eans(r)).toEqual(tier1Milk);
    expect(r.pendingTiers).toEqual([2]);
    expect(r.cursor).toEqual({ tier: 2, next: 0 });
  });

  it('returns a null cursor once every tier is searched to the end', async () => {
    const r = (await engineWith(1, 2, 3)).search('maito');
    expect(eans(r)).toEqual([...tier1Milk, ...tier2Milk, ...tier3Milk]);
    expect(r.cursor).toBeNull();
    expect(r.pendingTiers).toEqual([]);
  });

  it('returns nothing for an empty query', async () => {
    const r = (await engineWith(1)).search('  ');
    expect(r).toEqual({
      query: '  ',
      categories: [],
      products: [],
      cursor: null,
      pendingTiers: [2, 3],
      terms: [],
    });
  });

  it('echoes the raw query so a stale response can be recognised', async () => {
    expect((await engineWith(1)).search('Maito ').query).toBe('Maito ');
  });
});

describe('pages', () => {
  it('stops at the limit and continues with searchMore, across tiers', async () => {
    const engine = await engineWith(1, 2, 3);
    const first = engine.search('maito', 3);
    expect(eans(first)).toEqual(nums(2, 3, 4));
    expect(first.cursor).toEqual({ tier: 1, next: 4 });

    const second = engine.searchMore('maito', first.cursor!, 3);
    expect(eans(second)).toEqual(nums(8, 12, 13));
    expect(second.categories).toEqual([]);

    const third = engine.searchMore('maito', second.cursor!, 3);
    expect(eans(third)).toEqual(nums(18, 22));
    expect(third.cursor).toBeNull();
  });

  it('points at the next tier when the limit lands on the end of a tier', async () => {
    const engine = await engineWith(1, 2);
    const r = engine.search('maito', tier1Milk.length);
    expect(r.cursor).toEqual({ tier: 2, next: 0 });
    expect(eans(engine.searchMore('maito', r.cursor!))).toEqual(tier2Milk);
  });

  it('returns the same cursor and no products when the next tier is still loading', async () => {
    const engine = await engineWith(1);
    const more = engine.searchMore('maito', { tier: 2, next: 0 });
    expect(more.products).toEqual([]);
    expect(more.cursor).toEqual({ tier: 2, next: 0 });
  });
});

describe('match terms', () => {
  it('lists every term the products were matched on, aliases included', async () => {
    const engine = await engineWith(1, 2, 3);
    expect(engine.search('vessapaperi ').terms).toEqual([
      { term: 'wc paperi', wordStart: false },
      { term: 'talouspaperi', wordStart: false },
    ]);
  });

  it('marks 1–2 letter words as matched at word starts only', async () => {
    expect((await engineWith(1)).search('maito l').terms).toEqual([
      { term: 'maito', wordStart: false },
      { term: 'l', wordStart: true },
    ]);
  });

  it('includes the terms in searchMore and searchWithin responses too', async () => {
    const engine = await engineWith(1);
    const expected = [{ term: 'maito', wordStart: false }];
    expect(engine.searchMore('maito', { tier: 1, next: 0 }).terms).toEqual(expected);
    expect(engine.searchWithin(3, 'maito').terms).toEqual(expected);
  });
});

describe('category results', () => {
  it('lists matching categories with example products from loaded tiers', async () => {
    const r = (await engineWith(1)).search('maito');
    expect(r.categories.map((c) => c.category.name)).toEqual(['Maitotuotteet']);
    expect(r.categories[0]!.topProducts.map((p) => p.ean)).toEqual(nums(2, 3, 4));
  });

  it('fills in example products as the tier holding them arrives', async () => {
    const engine = await engineWith(1);
    // "Vaatteet ja asusteet": its only product is in tier 3
    expect(engine.search('vaatteet').categories[0]!.topProducts).toEqual([]);
    await engine.addTier(tiers[3]);
    expect(engine.search('vaatteet').categories[0]!.topProducts.map((p) => p.ean)).toEqual(
      nums(23),
    );
  });
});

describe('category results without example data', () => {
  it('shows the category with no examples when category-top has no entry for it', async () => {
    const engine = createSearchEngine({
      categories,
      categoryTop: {},
      categoryRank,
      aliases,
      yieldFn: noYield,
    });
    await engine.addTier(tiers[1]);
    const [hit] = engine.search('maito').categories;
    expect(hit?.category.name).toBe('Maitotuotteet');
    expect(hit?.topProducts).toEqual([]);
  });
});

describe('searchWithin', () => {
  it('lists every product of a category subtree for an empty query, in rank order', async () => {
    const r = (await engineWith(1, 2, 3)).searchWithin(3, '');
    expect(eans(r)).toEqual(nums(2, 3, 4, 12, 13, 18));
    expect(r.categories).toEqual([]);
  });

  it('searches only inside the category, including sub-categories', async () => {
    const engine = await engineWith(1, 2, 3);
    expect(eans(engine.searchWithin(2, 'luomu'))).toEqual(nums(12, 13));
    expect(eans(engine.searchWithin(7, 'maito'))).toEqual([]);
  });

  it('pages with a cursor', async () => {
    const engine = await engineWith(1, 2);
    const first = engine.searchWithin(3, '', 2);
    expect(eans(first)).toEqual(nums(2, 3));
    expect(eans(engine.searchWithin(3, '', 2, first.cursor!))).toEqual(nums(4, 12));
  });
});

describe('version and subscribe', () => {
  it('increments the version and notifies listeners when a tier lands', async () => {
    const engine = await engineWith();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    expect(engine.getVersion()).toBe(0);

    await engine.addTier(tiers[1]);
    expect(engine.getVersion()).toBe(1);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    await engine.addTier(tiers[2]);
    expect(engine.getVersion()).toBe(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('yields while indexing a large tier', async () => {
    const yieldFn = vi.fn(noYield);
    const engine = createSearchEngine({ categories, categoryTop, categoryRank, aliases, yieldFn });
    const size = 4001;
    await engine.addTier({
      version: 1,
      tier: 3,
      eans: Array.from({ length: size }, (_, i) => ean(1000 + i)),
      names: Array.from({ length: size }, (_, i) => `tuote ${i}`),
      categoryIds: Array.from({ length: size }, () => 13),
    });
    // twice for the haystack, twice for the EAN map
    expect(yieldFn).toHaveBeenCalledTimes(4);
  });
});
