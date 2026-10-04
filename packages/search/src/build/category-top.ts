import { compareProductRank, type Category } from '@pathfinder/core';
import type { CategoryRank, CategoryTop } from '../types';
import type { TierProduct } from './tiers';

/** Products listed per category in `category-top.json` (architecture §7 step 5). */
export const CATEGORY_TOP_SIZE = 10;

export type CategoryTopData = { top: CategoryTop; rank: CategoryRank };

/**
 * For every category with products in its subtree: its top products in rank order
 * (`category-top.json`), and the store-wide rank of its best one (`category-rank.json`,
 * 0 = the most popular product in the store). Categories with no products are left out.
 */
export function buildCategoryTop(
  products: readonly TierProduct[],
  categories: readonly Category[],
  size = CATEGORY_TOP_SIZE,
): CategoryTopData {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const top: Record<number, string[]> = {};
  const rank: CategoryRank = {};
  const sorted = [...products].sort(compareProductRank);
  sorted.forEach((product, position) => {
    // The product counts for its own category and every ancestor.
    for (let id: number | undefined = product.categoryId; id !== undefined; id = parentOf.get(id)) {
      const list = (top[id] ??= []);
      if (list.length < size) list.push(product.ean);
      rank[id] ??= position;
    }
  });
  return { top, rank };
}
