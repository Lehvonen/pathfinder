import type { Category } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import {
  checkCategoryIds,
  equalShare,
  EXCLUDED,
  FOOD,
  splitTiers,
  TIER_OPTIONS,
  type TierOptions,
  type TierProduct,
} from './tiers';

describe('equalShare', () => {
  it('splits evenly when every group is big enough', () => {
    expect(
      equalShare(
        new Map([
          ['a', 50],
          ['b', 50],
        ]),
        20,
      ),
    ).toEqual(
      new Map([
        ['a', 10],
        ['b', 10],
      ]),
    );
  });

  it('gives small groups everything and moves their spare places on, repeatedly', () => {
    // share 5: a (1) and b (3) fit, 16 left for 2 groups; share 8: c and d get 8 each
    const shares = equalShare(
      new Map([
        ['a', 1],
        ['b', 3],
        ['c', 100],
        ['d', 100],
      ]),
      20,
    );
    expect(shares).toEqual(
      new Map([
        ['a', 1],
        ['b', 3],
        ['c', 8],
        ['d', 8],
      ]),
    );
  });

  it('moves spare places on a second time when a group fits only after the first round', () => {
    // share 10: a (2) fits, 28 left; share 14: b (12) fits, 16 left; share 16 for c
    const shares = equalShare(
      new Map([
        ['a', 2],
        ['b', 12],
        ['c', 100],
      ]),
      30,
    );
    expect(shares).toEqual(
      new Map([
        ['a', 2],
        ['b', 12],
        ['c', 16],
      ]),
    );
  });

  it('drops places lost to rounding down', () => {
    expect(
      equalShare(
        new Map([
          ['a', 9],
          ['b', 9],
        ]),
        5,
      ),
    ).toEqual(
      new Map([
        ['a', 2],
        ['b', 2],
      ]),
    );
  });

  it('handles no groups and no places', () => {
    expect(equalShare(new Map(), 10)).toEqual(new Map());
    expect(equalShare(new Map([['a', 4]]), 0)).toEqual(new Map([['a', 0]]));
  });
});

// Top levels: 10, 20 food; 30, 40 other; 50 excluded. Leaves 11 and 21 sit under 10 and 20.
const categories: Category[] = [10, 20, 30, 40, 50]
  .map((id): Category => ({ id, name: `c${id}`, temperature: 'ambient' }))
  .concat([
    { id: 11, name: 'c11', temperature: 'ambient', parentId: 10 },
    { id: 21, name: 'c21', temperature: 'ambient', parentId: 20 },
  ]);
const options: TierOptions = { tier1Size: 4, tier2Size: 6, food: [10, 20], excluded: [50] };

let next = 0;
/** A product in `categoryId`; higher popularity ranks higher; `null` is unranked. */
const product = (categoryId: number, popularity: number | null): TierProduct => ({
  ean: String(1000 + next++),
  name: `p${next}`,
  popularity,
  categoryId,
});
const ids = (list: TierProduct[]) => list.map((p) => `${p.categoryId}:${p.popularity}`);

describe('splitTiers', () => {
  const products = [
    product(11, 90),
    product(10, 80),
    product(10, 70),
    product(10, 60), // food 10, via a leaf too
    product(21, 50),
    product(20, 40), // food 20
    product(30, 99),
    product(30, 30),
    product(40, 20),
    product(40, 10),
    product(40, 5), // other
    product(50, 1000), // excluded, the most popular product of all
    product(10, null),
    product(30, null), // unranked
  ];
  const tiers = splitTiers(products, categories, options);

  it('fills tier 1 with an equal share of food per top-level category, by popularity', () => {
    // share 2 each: 10 → 90, 80 (90 is in leaf 11); 20 → 50, 40 (50 is in leaf 21)
    expect(ids(tiers[1])).toEqual(['11:90', '10:80', '21:50', '20:40']);
  });

  it('puts the rest of the ranked food in tier 2 before any other product', () => {
    expect(ids(tiers[2]).filter((id) => id.startsWith('10:'))).toEqual(['10:70', '10:60']);
  });

  it('fills the remaining tier 2 places with an equal share per other category', () => {
    // 6 places - 2 food = 4, so 2 each for 30 and 40; tier 2 is in rank order
    expect(ids(tiers[2])).toEqual(['30:99', '10:70', '10:60', '30:30', '40:20', '40:10']);
  });

  it('keeps excluded categories and unranked products out of tiers 1–2', () => {
    expect(ids(tiers[3])).toEqual(['50:1000', '40:5', '10:null', '30:null']);
  });

  it('puts every product in exactly one tier', () => {
    const all = [...tiers[1], ...tiers[2], ...tiers[3]];
    expect(all).toHaveLength(products.length);
    expect(new Set(all.map((p) => p.ean)).size).toBe(products.length);
  });

  it('gives other categories no tier 2 places when leftover food fills it', () => {
    const lots = Array.from({ length: 12 }, (_, i) => product(10, 500 - i));
    const split = splitTiers([...lots, product(30, 999)], categories, options);
    expect(split[1]).toHaveLength(4);
    expect(split[2]).toHaveLength(8); // all leftover food, even past tier2Size
    expect(ids(split[3])).toEqual(['30:999']);
  });

  it('handles an empty catalogue', () => {
    expect(splitTiers([], categories, options)).toEqual({ 1: [], 2: [], 3: [] });
  });
});

describe('checkCategoryIds', () => {
  it('finds nothing wrong when every id has its expected name at the top level', () => {
    expect(checkCategoryIds(categories, { 10: 'c10', 50: 'c50' })).toEqual([]);
  });

  it('reports a missing id, a renamed one and one that is no longer top-level', () => {
    expect(checkCategoryIds(categories, { 99: 'Gone', 10: 'Maito', 11: 'c11' })).toEqual([
      'category 10 is "c10", expected "Maito"',
      'category 11 ("c11") is not top-level',
      'category 99 ("Gone") is missing',
    ]);
  });
});

describe('the real tier options', () => {
  it('lists 14 food categories and keeps them apart from the excluded ones', () => {
    expect(Object.keys(FOOD)).toHaveLength(14);
    expect(TIER_OPTIONS.food.filter((id) => TIER_OPTIONS.excluded.includes(id))).toEqual([]);
    expect(TIER_OPTIONS.excluded).toEqual(Object.keys(EXCLUDED).map(Number));
  });
});
