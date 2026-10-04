import { compareStrings } from '@pathfinder/core';
import type { TierData, TierNumber } from '../types';
import type { TierProduct } from './tiers';

/**
 * One tier's products as a columnar tier file. The products must already be in rank
 * order (as `splitTiers` returns them); popularity is dropped, the order carries it.
 */
export function toTierData(tier: TierNumber, products: readonly TierProduct[]): TierData {
  return {
    version: 1,
    tier,
    eans: products.map((p) => p.ean),
    names: products.map((p) => p.name),
    categoryIds: products.map((p) => p.categoryId),
  };
}

/**
 * JSON with object keys sorted at every level and no whitespace, so the same data always
 * gives the same bytes: re-running the build on unchanged input changes no files.
 * Integer-like keys (category ids) come out in numeric order, which JavaScript enforces
 * for every object; other keys in code-unit order.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => compareStrings(a, b)))
      : v,
  );
}
