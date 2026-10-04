import { compareProductRank, type Category, type RankedProduct } from '@pathfinder/core';
import type { TierNumber } from '../types';

/**
 * Top-level categories by id, with the name each id is expected to have. Ids are stable
 * (`category-ids.json` is append-only); the names catch a K-Ruoka rename or renumbering
 * instead of silently moving products between tiers (docs/plans/search.md §3).
 */
export const FOOD: Readonly<Record<number, string>> = {
  1: 'Hedelmät ja vihannekset',
  43: 'Juomat',
  120: 'Kala ja merenelävät',
  437: 'Kuivat elintarvikkeet ja leivonta',
  562: 'Leivät, keksit ja leivonnaiset',
  636: 'Liha ja kasviproteiinit',
  681: 'Maito, juusto, munat ja rasvat',
  741: 'Makeiset ja naposteltavat',
  767: 'Mausteet ja maustaminen',
  795: 'Öljyt, etikat ja salaattikastikkeet',
  814: 'Pakasteet',
  884: 'Säilykkeet, keitot ja ateria-ainekset',
  910: 'Texmex ja maailman maut',
  953: 'Valmisruoka',
};

/** Never in tiers 1–2: clothing and shoes, and products without a category. */
export const EXCLUDED: Readonly<Record<number, string>> = {
  182: 'Kengät ja kenkienhoito',
  928: 'Uncategorised',
  929: 'Vaatteet ja asusteet',
};

export type TierOptions = {
  tier1Size: number;
  tier2Size: number;
  food: readonly number[];
  excluded: readonly number[];
};

export const TIER_OPTIONS: TierOptions = {
  tier1Size: 8000,
  tier2Size: 10000,
  food: Object.keys(FOOD).map(Number),
  excluded: Object.keys(EXCLUDED).map(Number),
};

export type TierProduct = RankedProduct & { categoryId: number };

/**
 * Splits products into tiers 1–3, each in rank order:
 * 1. the most popular food, an equal share of `tier1Size` per food top-level category;
 * 2. every other ranked food product, **then** an equal share of what is left of
 *    `tier2Size` per remaining top-level category (not food, not excluded): all food comes
 *    before any non-food product, each part in rank order, so a popular non-food product
 *    never pushes food off the first page (docs/plans/search.md §3);
 * 3. everything else, including every unranked product.
 */
export function splitTiers<T extends TierProduct>(
  products: readonly T[],
  categories: readonly Category[],
  options: TierOptions = TIER_OPTIONS,
): Record<TierNumber, T[]> {
  const topLevelOf = topLevels(categories);
  const food = new Set(options.food);
  const excluded = new Set(options.excluded);
  const sorted = [...products].sort(compareProductRank);

  const foodGroups = new Map<number, T[]>();
  const otherGroups = new Map<number, T[]>();
  for (const product of sorted) {
    if (product.popularity === null) continue;
    const top = topLevelOf(product.categoryId);
    if (excluded.has(top)) continue;
    const groups = food.has(top) ? foodGroups : otherGroups;
    const group = groups.get(top);
    if (group) group.push(product);
    else groups.set(top, [product]);
  }

  const tier1 = new Set<T>();
  const foodShares = equalShare(sizes(foodGroups), options.tier1Size);
  for (const [top, group] of foodGroups) {
    for (const product of group.slice(0, foodShares.get(top))) tier1.add(product);
  }

  const tier2Food = new Set<T>();
  for (const group of foodGroups.values()) {
    for (const product of group) if (!tier1.has(product)) tier2Food.add(product);
  }
  const tier2Other = new Set<T>();
  const room = Math.max(0, options.tier2Size - tier2Food.size);
  const otherShares = equalShare(sizes(otherGroups), room);
  for (const [top, group] of otherGroups) {
    for (const product of group.slice(0, otherShares.get(top))) tier2Other.add(product);
  }

  const inTier1Or2 = (p: T) => tier1.has(p) || tier2Food.has(p) || tier2Other.has(p);
  return {
    1: sorted.filter((p) => tier1.has(p)),
    2: [...sorted.filter((p) => tier2Food.has(p)), ...sorted.filter((p) => tier2Other.has(p))],
    3: sorted.filter((p) => !inTier1Or2(p)),
  };
}

/**
 * Shares `total` places equally between groups. A group smaller than its share takes
 * all of its products and its spare places go to the others, until no group is
 * smaller than the share. Places lost to rounding down are not redistributed.
 */
export function equalShare<K>(groupSizes: ReadonlyMap<K, number>, total: number): Map<K, number> {
  const shares = new Map<K, number>();
  let rest = [...groupSizes];
  let left = total;
  while (rest.length > 0) {
    const share = Math.floor(left / rest.length);
    const small = rest.filter(([, size]) => size <= share);
    if (small.length === 0) {
      for (const [key] of rest) shares.set(key, share);
      break;
    }
    for (const [key, size] of small) {
      shares.set(key, size);
      left -= size;
    }
    rest = rest.filter(([, size]) => size > share);
  }
  return shares;
}

/** Problems with the expected top-level ids: a missing id, or one with another name. */
export function checkCategoryIds(
  categories: readonly Category[],
  expected: Readonly<Record<number, string>>,
): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return Object.entries(expected).flatMap(([id, name]) => {
    const category = byId.get(Number(id));
    if (!category) return [`category ${id} ("${name}") is missing`];
    if (category.name !== name) return [`category ${id} is "${category.name}", expected "${name}"`];
    if (category.parentId !== undefined) return [`category ${id} ("${name}") is not top-level`];
    return [];
  });
}

function sizes<K, V>(groups: ReadonlyMap<K, readonly V[]>): Map<K, number> {
  return new Map([...groups].map(([key, group]) => [key, group.length]));
}

/** Category id → its top-level ancestor's id, memoised. */
export function topLevels(categories: readonly Category[]): (id: number) => number {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const memo = new Map<number, number>();
  const topLevelOf = (id: number): number => {
    let top = memo.get(id);
    if (top === undefined) {
      const parent = parentOf.get(id);
      top = parent === undefined ? id : topLevelOf(parent);
      memo.set(id, top);
    }
    return top;
  };
  return topLevelOf;
}
