import { compareProductRank, type Category } from '@pathfinder/core';
import { fold } from '../normalise';
import type { CategoryTop, TierNumber } from '../types';
import { topLevels, type TierProduct } from './tiers';

export const MAX_ALIAS_KEY_LENGTH = 40;
export const MAX_ALIAS_TERMS = 8;

export type BuildOutput = {
  products: readonly TierProduct[];
  tiers: Readonly<Record<TierNumber, readonly TierProduct[]>>;
  categories: readonly Category[];
  categoryTop: CategoryTop;
  /** Top-level category ids that must never be in tiers 1–2. */
  excluded: readonly number[];
};

/**
 * Everything that must hold before the search build writes a file
 * (docs/plans/search.md §3, §6). Returns the problems found; empty means valid.
 */
export function validateBuild(output: BuildOutput): string[] {
  const { products, tiers, categories, categoryTop } = output;
  const problems: string[] = [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const topLevelOf = topLevels(categories);
  const excluded = new Set(output.excluded);

  const tierOf = new Map<string, TierNumber>();
  for (const tier of [1, 2, 3] as const) {
    const list = tiers[tier];
    list.forEach((product, i) => {
      const where = `tier ${tier}: ${product.ean}`;
      const seen = tierOf.get(product.ean);
      if (seen !== undefined) problems.push(`${where} is also in tier ${seen}`);
      tierOf.set(product.ean, tier);
      if (!categoryIds.has(product.categoryId)) {
        problems.push(`${where} has unknown category ${product.categoryId}`);
      }
      if (tier < 3 && product.popularity === null) problems.push(`${where} is unranked`);
      if (tier < 3 && excluded.has(topLevelOf(product.categoryId))) {
        problems.push(`${where} is in excluded category ${topLevelOf(product.categoryId)}`);
      }
      const previous = list[i - 1];
      if (previous && compareProductRank(previous, product) > 0) {
        problems.push(`${where} is out of rank order`);
      }
    });
  }
  for (const product of products) {
    if (!tierOf.has(product.ean)) problems.push(`${product.ean} is in no tier`);
  }
  const tiered = tiers[1].length + tiers[2].length + tiers[3].length;
  if (tiered !== products.length) {
    problems.push(`tiers hold ${tiered} products, the catalogue has ${products.length}`);
  }
  for (const [id, eans] of Object.entries(categoryTop)) {
    for (const ean of eans) {
      if (!tierOf.has(ean)) problems.push(`category-top ${id}: ${ean} is in no tier`);
    }
  }
  return problems;
}

/**
 * Checks `aliases.json` (docs/plans/search.md §5.2): an object of query word → non-empty
 * list of terms. A key must fold to one word, because aliases are looked up per word.
 */
export function validateAliases(aliases: unknown): string[] {
  if (aliases === null || typeof aliases !== 'object' || Array.isArray(aliases)) {
    return ['aliases must be an object of word → terms'];
  }
  const problems: string[] = [];
  const folded = new Map<string, string>();
  for (const [key, terms] of Object.entries(aliases)) {
    const where = `alias "${key}"`;
    const foldedKey = fold(key);
    if (foldedKey === '') problems.push(`${where}: key has no letters or digits`);
    if (foldedKey.includes(' ')) problems.push(`${where}: key must be one word`);
    if (key.length > MAX_ALIAS_KEY_LENGTH) {
      problems.push(`${where}: key is longer than ${MAX_ALIAS_KEY_LENGTH} characters`);
    }
    const other = folded.get(foldedKey);
    if (other !== undefined) problems.push(`${where}: same word as alias "${other}"`);
    folded.set(foldedKey, key);

    if (!Array.isArray(terms) || terms.length === 0) {
      problems.push(`${where}: terms must be a non-empty list`);
      continue;
    }
    if (terms.length > MAX_ALIAS_TERMS) {
      problems.push(`${where}: more than ${MAX_ALIAS_TERMS} terms`);
    }
    for (const term of terms) {
      if (typeof term !== 'string' || fold(term) === '') {
        problems.push(`${where}: term ${JSON.stringify(term)} has no letters or digits`);
      }
    }
  }
  return problems;
}
