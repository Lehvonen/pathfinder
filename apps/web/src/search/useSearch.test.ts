import { createSearchEngine, type SearchResponse, type TierData } from '@pathfinder/search';
import { describe, expect, it } from 'vitest';
import { canShowMore, runSearch } from './useSearch';

const milks = (tier: 1 | 2, count: number): TierData => ({
  version: 1,
  tier,
  eans: Array.from({ length: count }, (_, i) => `${tier}${String(i).padStart(3, '0')}`),
  names: Array.from({ length: count }, (_, i) => `Maito ${tier}-${i}`),
  categoryIds: Array.from({ length: count }, () => 1),
});

async function engineWith(...tiers: TierData[]) {
  const engine = createSearchEngine({
    categories: [{ id: 1, name: 'Maidot', temperature: 'chilled' }],
    categoryTop: {},
    categoryRank: { 1: 0 },
    aliases: {},
    yieldFn: async () => {},
  });
  for (const tier of tiers) await engine.addTier(tier);
  return engine;
}

describe('runSearch', () => {
  it('returns null until there is an engine', () => {
    expect(runSearch(null, 'maito', 20, 0)).toBeNull();
  });

  it('asks the engine for as many rows as are shown', async () => {
    const engine = await engineWith(milks(1, 50));
    expect(runSearch(engine, 'maito', 20, 1)?.products).toHaveLength(20);
    expect(runSearch(engine, 'maito', 40, 1)?.products).toHaveLength(40);
  });
});

describe('canShowMore', () => {
  const response = (overrides: Partial<SearchResponse>): SearchResponse => ({
    query: 'maito',
    categories: [],
    products: [],
    pendingTiers: [],
    cursor: null,
    ...overrides,
  });

  it('is false with no response, or when nothing more exists', () => {
    expect(canShowMore(null)).toBe(false);
    expect(canShowMore(response({ cursor: null }))).toBe(false);
  });

  it('is true when the scan stopped at the row count in a loaded tier', () => {
    expect(canShowMore(response({ cursor: { tier: 1, next: 20 } }))).toBe(true);
  });

  it('is false when the next rows are in a tier still loading; they arrive by themselves', () => {
    const waiting = response({ cursor: { tier: 2, next: 0 }, pendingTiers: [2, 3] });
    expect(canShowMore(waiting)).toBe(false);
  });

  it('follows a real engine: more rows in tier 1, then waiting for tier 2', async () => {
    const engine = await engineWith(milks(1, 25));
    expect(canShowMore(runSearch(engine, 'maito', 20, 1))).toBe(true);
    expect(canShowMore(runSearch(engine, 'maito', 40, 1))).toBe(false);
    await engine.addTier(milks(2, 5));
    expect(canShowMore(runSearch(engine, 'maito', 40, 2))).toBe(false); // tier 3 pending
  });
});
