import type { Category } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import { buildCategoryTop, CATEGORY_TOP_SIZE } from './category-top';
import type { TierProduct } from './tiers';

// 1 Maito… > 2 Maitotuotteet > 3 Maidot; 4 Juustot under 2; 5 Leivät on its own; 6 empty
const categories: Category[] = [
  { id: 1, name: 'Maito, juusto, munat ja rasvat', temperature: 'chilled' },
  { id: 2, name: 'Maitotuotteet', temperature: 'chilled', parentId: 1 },
  { id: 3, name: 'Maidot', temperature: 'chilled', parentId: 2 },
  { id: 4, name: 'Juustot', temperature: 'chilled', parentId: 2 },
  { id: 5, name: 'Leivät', temperature: 'ambient' },
  { id: 6, name: 'Tyhjä', temperature: 'ambient' },
];

const product = (ean: string, categoryId: number, popularity: number | null): TierProduct => ({
  ean,
  name: `p${ean}`,
  popularity,
  categoryId,
});

describe('buildCategoryTop', () => {
  // Given out of order on purpose: the function sorts by rank itself.
  const products = [
    product('cheese', 4, 50),
    product('bread', 5, 999),
    product('milk', 3, 70),
    product('oat milk', 3, null),
  ];
  const { top, rank } = buildCategoryTop(products, categories);

  it('lists the top products of each category in rank order', () => {
    expect(top[3]).toEqual(['milk', 'oat milk']);
    expect(top[4]).toEqual(['cheese']);
    expect(top[5]).toEqual(['bread']);
  });

  it('counts a product for every ancestor of its category', () => {
    expect(top[2]).toEqual(['milk', 'cheese', 'oat milk']);
    expect(top[1]).toEqual(['milk', 'cheese', 'oat milk']);
  });

  it('ranks each category by the store-wide position of its best product', () => {
    // store order: bread 0, milk 1, cheese 2, oat milk 3
    expect(rank).toEqual({ 1: 1, 2: 1, 3: 1, 4: 2, 5: 0 });
  });

  it('leaves out categories with no products', () => {
    expect(top[6]).toBeUndefined();
    expect(rank[6]).toBeUndefined();
  });

  it(`keeps at most ${CATEGORY_TOP_SIZE} products per category`, () => {
    const many = Array.from({ length: CATEGORY_TOP_SIZE + 1 }, (_, i) =>
      product(String(i), 5, 100 - i),
    );
    expect(buildCategoryTop(many, categories).top[5]).toEqual(
      Array.from({ length: CATEGORY_TOP_SIZE }, (_, i) => String(i)),
    );
    expect(buildCategoryTop(many.slice(0, CATEGORY_TOP_SIZE), categories).top[5]).toHaveLength(
      CATEGORY_TOP_SIZE,
    );
  });

  it('handles an empty catalogue', () => {
    expect(buildCategoryTop([], categories)).toEqual({ top: {}, rank: {} });
  });
});
