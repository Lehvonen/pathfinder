/*
 * Validates the cleaner's output against the data contract (docs/plans/normalise.md §4,
 * rule 11) before anything is written. The start of scripts/validate-data.ts (§5).
 *
 * Each schema is typed as the contract type it mirrors, so a change to types.ts that the
 * schema does not follow fails the typecheck. Objects are strict: an extra field such as
 * price must never reach data/ (ARCHITECTURE.md §6).
 */
import type { Category, Placement, Product } from '@pathfinder/core';
import { z } from 'zod';

export interface NormalisedData {
  products: Product[];
  placements: Placement[];
  categories: Category[];
}

const ean = z.string().regex(/^(\d{8}|\d{12,14})$/, 'not an EAN');
const id = z.number().int().positive();

export const productSchema: z.ZodType<Product> = z.strictObject({
  ean,
  name: z.string().min(1),
  brand: z.string().min(1).optional(),
  categoryId: id,
});

export const placementSchema: z.ZodType<Placement> = z.strictObject({
  ean,
  shelfId: z.string().regex(/^[^:]+:[^:]+$/, 'not <departmentId>:<shelf>'),
  shelfLevel: z.number().int().positive().optional(),
  isPrimary: z.boolean(),
});

export const categorySchema: z.ZodType<Category> = z.strictObject({
  id,
  name: z.string().min(1),
  temperature: z.enum(['ambient', 'chilled', 'frozen']),
  parentId: id.optional(),
});

function schemaErrors<T>(
  kind: string,
  schema: z.ZodType<T>,
  records: unknown[],
  key: (record: unknown, index: number) => string,
): string[] {
  return records.flatMap((record, index) => {
    const result = schema.safeParse(record);
    if (result.success) return [];
    return result.error.issues.map(
      (issue) =>
        `${kind} ${key(record, index)}: ${issue.path.join('.') || '(record)'} ${issue.message}`,
    );
  });
}

/** Names a record by its key field, or by its position when it has none. */
const keyOf =
  (field: string) =>
  (record: unknown, index: number): string =>
    typeof record === 'object' && record !== null && field in record
      ? String((record as Record<string, unknown>)[field])
      : `#${index}`;

/** Every problem found, one line each. Empty means the data is valid. */
export function validateNormalised(data: NormalisedData): string[] {
  const errors = [
    ...schemaErrors('product', productSchema, data.products, keyOf('ean')),
    ...schemaErrors('placement', placementSchema, data.placements, keyOf('ean')),
    ...schemaErrors('category', categorySchema, data.categories, keyOf('id')),
  ];

  const products = new Set<string>();
  for (const product of data.products) {
    if (products.has(product.ean)) errors.push(`product ${product.ean}: duplicate EAN`);
    products.add(product.ean);
  }

  const primaries = new Map<string, number>();
  for (const placement of data.placements) {
    if (!products.has(placement.ean)) {
      errors.push(`placement ${placement.ean}: no such product`);
    }
    if (placement.isPrimary) {
      primaries.set(placement.ean, (primaries.get(placement.ean) ?? 0) + 1);
    }
  }
  for (const ean of products) {
    const count = primaries.get(ean) ?? 0;
    if (count !== 1) errors.push(`product ${ean}: ${count} primary placements, expected 1`);
  }

  const categories = new Set<number>();
  for (const category of data.categories) {
    if (categories.has(category.id)) errors.push(`category ${category.id}: duplicate id`);
    categories.add(category.id);
  }
  for (const category of data.categories) {
    if (category.parentId !== undefined && !categories.has(category.parentId)) {
      errors.push(`category ${category.id}: no such parent ${category.parentId}`);
    }
  }
  for (const product of data.products) {
    if (!categories.has(product.categoryId)) {
      errors.push(`product ${product.ean}: no such category ${product.categoryId}`);
    }
  }

  return errors;
}
