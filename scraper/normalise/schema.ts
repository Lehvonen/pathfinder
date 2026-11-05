/*
 * Validates the cleaner's output against the data contract (docs/plans/normalise.md §4,
 * rule 11) before anything is written, and the hand-maintained curation files before they
 * are used. The start of scripts/validate-data.ts (§5).
 *
 * schema.test.ts checks that each schema's type equals the contract type it mirrors, in
 * both directions, so a change to types.ts that a schema does not follow fails the
 * typecheck. Objects are strict: an extra field such as price must never reach data/
 * (ARCHITECTURE.md §6, §17).
 */
import type { Category, Placement, Product } from '@pathfinder/core';
import { z } from 'zod';
import { isValidEan } from './clean';

export interface NormalisedData {
  products: Product[];
  placements: Placement[];
  categories: Category[];
}

export const temperatureSchema = z.enum(['ambient', 'chilled', 'frozen']);

const ean = z.string().refine(isValidEan, 'not an EAN');
const id = z.number().int().positive();

export const productSchema = z.strictObject({
  ean,
  name: z.string().min(1),
  brand: z.string().min(1).optional(),
  categoryId: id,
});

export const placementSchema = z.strictObject({
  ean,
  shelfId: z.string().regex(/^[^:]+:[^:]+$/, 'not <departmentId>:<shelf>'),
  shelfLevel: z.number().int().positive().optional(),
  isPrimary: z.boolean(),
});

export const categorySchema = z.strictObject({
  id,
  name: z.string().min(1),
  temperature: temperatureSchema,
  parentId: id.optional(),
});

/**
 * data/normalised/popularity.json: EAN → Kesko popularity score, read by the search
 * build. `null` means unranked; a score of 0 is written as `null`, never as 0
 * (ARCHITECTURE.md §6).
 */
export const popularitySchema = z.record(ean, z.number().positive().nullable());

// ── Curation files (data/curation/) ──────────────────────────

export const curatedDepartmentsSchema = z.array(
  z.strictObject({
    id: z.string().min(1),
    name: z.string(),
    kind: z.enum(['aisle', 'counter', 'backroom', 'junk']),
    temperature: temperatureSchema,
    label: z.string().min(1).optional(),
    reviewed: z.literal(false).optional(),
  }),
);

/** categoryPath → temperature, wins over the vote. */
export const categoryOverridesSchema = z.record(z.string(), temperatureSchema);

/** categoryPath → display name. */
export const categoryNamesSchema = z.record(z.string(), z.string().min(1));

/** data/normalised/category-ids.json, the append-only registry read back on every run. */
export const categoryIdsSchema = z.record(z.string(), id);

// ── Map source files (data/graph/) ───────────────────────────

/** A point in metres, origin at the floorplan's top-left, y down (types.ts, walk graph). */
const point = z.tuple([z.number().nonnegative(), z.number().nonnegative()]);

/** Lowercase kebab-case. å, ä and ö are letters of their own and are kept, never replaced. */
const kebabId = z.string().regex(/^[a-z0-9åäö]+(-[a-z0-9åäö]+)*$/, 'not kebab-case');

/**
 * data/graph/areas.json: the labelled areas of the store's own map, traced from `source`
 * and scaled by `metresPerSourceUnit`. `label` is the text printed on the map; an area
 * printed without one has none. `entrances` are where the map's arrows lead into the
 * store, where every route starts. Shelf polygons and the walk graph are built over these.
 */
export const mapAreasSchema = z.strictObject({
  version: z.literal(1),
  source: z.url(),
  metresPerSourceUnit: z.number().positive(),
  entrances: z.array(z.strictObject({ id: kebabId, point })).min(1),
  areas: z.array(
    z.strictObject({
      id: kebabId,
      label: z.string().min(1).optional(),
      kind: z.enum(['goods', 'checkout', 'other']),
      polygon: z.array(point).min(3),
    }),
  ),
});

export type MapAreas = z.infer<typeof mapAreasSchema>;

/** Twice the signed area of a polygon (shoelace). Zero means its points are in a line. */
function doubledArea(polygon: [number, number][]): number {
  let sum = 0;
  polygon.forEach(([x1, y1], i) => {
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    sum += x1 * y2 - x2 * y1;
  });
  return sum;
}

/**
 * Every problem in data/graph/areas.json, one line each. Empty means it is valid. Areas and
 * entrances share one id space, so a walk-graph node named after either is unambiguous.
 */
export function validateMapAreas(data: unknown): string[] {
  const result = mapAreasSchema.safeParse(data);
  if (!result.success) {
    return result.error.issues.map(
      (issue) => `areas: ${issue.path.join('.') || '(file)'} ${issue.message}`,
    );
  }
  const errors: string[] = [];
  const ids = new Set<string>();
  const claim = (kind: string, id: string) => {
    if (ids.has(id)) errors.push(`${kind} ${id}: duplicate id`);
    ids.add(id);
  };
  for (const entrance of result.data.entrances) claim('entrance', entrance.id);
  for (const area of result.data.areas) {
    claim('area', area.id);
    if (doubledArea(area.polygon) === 0) errors.push(`area ${area.id}: polygon has no area`);
  }
  return errors;
}

// ── Output validation ────────────────────────────────────────

/** Names a record by its key field, or by its position when it has none. */
const keyOf =
  (field: string) =>
  (record: unknown, index: number): string =>
    typeof record === 'object' && record !== null && field in record
      ? String((record as Record<string, unknown>)[field])
      : `#${index}`;

/** The records that pass the schema, and one line per problem in those that do not. */
function check<T>(
  kind: string,
  schema: z.ZodType<T>,
  records: unknown[],
  key: (record: unknown, index: number) => string,
): { valid: T[]; errors: string[] } {
  const valid: T[] = [];
  const errors: string[] = [];
  records.forEach((record, index) => {
    const result = schema.safeParse(record);
    if (result.success) {
      valid.push(result.data);
      return;
    }
    for (const issue of result.error.issues) {
      errors.push(
        `${kind} ${key(record, index)}: ${issue.path.join('.') || '(record)'} ${issue.message}`,
      );
    }
  });
  return { valid, errors };
}

/** Every value of `field` that has the given type, valid record or not. */
function keysOf<T>(records: unknown[], field: string, type: 'string' | 'number'): Set<T> {
  const keys = new Set<T>();
  for (const record of records) {
    const value =
      typeof record === 'object' && record !== null
        ? (record as Record<string, unknown>)[field]
        : undefined;
    if (typeof value === type) keys.add(value as T);
  }
  return keys;
}

/**
 * Every problem found, one line each. Empty means the data is valid. Cross-reference
 * checks run only on records that passed their schema, so a broken record is reported
 * once, by its schema error. A reference to a record that exists but is broken is not
 * reported again as missing.
 */
export function validateNormalised(data: NormalisedData): string[] {
  const products = check('product', productSchema, data.products, keyOf('ean'));
  const placements = check('placement', placementSchema, data.placements, keyOf('ean'));
  const categories = check('category', categorySchema, data.categories, keyOf('id'));
  const errors = [...products.errors, ...placements.errors, ...categories.errors];

  const productEans = keysOf<string>(data.products, 'ean', 'string');
  const categoryIds = keysOf<number>(data.categories, 'id', 'number');

  const seen = new Set<string>();
  for (const product of products.valid) {
    if (seen.has(product.ean)) errors.push(`product ${product.ean}: duplicate EAN`);
    seen.add(product.ean);
  }

  const primaries = new Map<string, number>();
  for (const placement of placements.valid) {
    if (!productEans.has(placement.ean)) {
      errors.push(`placement ${placement.ean}: no such product`);
    }
    if (placement.isPrimary) {
      primaries.set(placement.ean, (primaries.get(placement.ean) ?? 0) + 1);
    }
  }
  for (const ean of seen) {
    const count = primaries.get(ean) ?? 0;
    if (count !== 1) errors.push(`product ${ean}: ${count} primary placements, expected 1`);
  }

  const ids = new Set<number>();
  for (const category of categories.valid) {
    if (ids.has(category.id)) errors.push(`category ${category.id}: duplicate id`);
    ids.add(category.id);
  }
  for (const category of categories.valid) {
    if (category.parentId !== undefined && !categoryIds.has(category.parentId)) {
      errors.push(`category ${category.id}: no such parent ${category.parentId}`);
    }
  }
  for (const product of products.valid) {
    if (!categoryIds.has(product.categoryId)) {
      errors.push(`product ${product.ean}: no such category ${product.categoryId}`);
    }
  }

  return errors;
}
