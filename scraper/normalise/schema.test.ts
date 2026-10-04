import type { Category, Placement, Product } from '@pathfinder/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { CuratedDepartment } from './departments';
import {
  categoryIdsSchema,
  categoryNamesSchema,
  categoryOverridesSchema,
  categorySchema,
  curatedDepartmentsSchema,
  placementSchema,
  popularitySchema,
  productSchema,
  validateNormalised,
  type NormalisedData,
} from './schema';

describe('schema types', () => {
  // Checked by the typecheck: a change to types.ts or departments.ts that a schema does
  // not follow, in either direction, fails to compile
  it('equal the contract types they mirror', () => {
    expectTypeOf<z.infer<typeof productSchema>>().toEqualTypeOf<Product>();
    expectTypeOf<z.infer<typeof placementSchema>>().toEqualTypeOf<Placement>();
    expectTypeOf<z.infer<typeof categorySchema>>().toEqualTypeOf<Category>();
    expectTypeOf<z.infer<typeof curatedDepartmentsSchema>>().toEqualTypeOf<CuratedDepartment[]>();
  });
});

describe('curation schemas', () => {
  const row = { id: '91208', name: '(MAITO) Maidot', kind: 'aisle', temperature: 'chilled' };

  it('accept valid department rows, reviewed or not', () => {
    const rows = [row, { ...row, id: '600', label: 'Jäätelöt', reviewed: false }];
    expect(curatedDepartmentsSchema.safeParse(rows).success).toBe(true);
  });

  it.each([
    ['a typo in kind', { ...row, kind: 'junkk' }],
    ['an unknown temperature', { ...row, temperature: 'warm' }],
    ['reviewed: true', { ...row, reviewed: true }],
    ['an unknown field', { ...row, kinds: 'aisle' }],
    ['an empty id', { ...row, id: '' }],
  ])('reject a department row with %s', (_, bad) => {
    expect(curatedDepartmentsSchema.safeParse([bad]).success).toBe(false);
  });

  it('check overrides and names', () => {
    expect(categoryOverridesSchema.safeParse({ 'a/b': 'frozen' }).success).toBe(true);
    expect(categoryOverridesSchema.safeParse({ 'a/b': 'cold' }).success).toBe(false);
    expect(categoryNamesSchema.safeParse({ a: 'Maidot' }).success).toBe(true);
    expect(categoryNamesSchema.safeParse({ a: '' }).success).toBe(false);
    expect(categoryIdsSchema.safeParse({ a: 1, 'a/b': 2 }).success).toBe(true);
    expect(categoryIdsSchema.safeParse({ a: 0 }).success).toBe(false);
  });
});

const MILK = '6410405082657';
const BREAD = '6410405000001';

function valid(): NormalisedData {
  return {
    products: [
      { ean: MILK, name: 'Pirkka suomalainen kevytmaito 1l', brand: 'Pirkka', categoryId: 2 },
      { ean: BREAD, name: 'Ruisleipä', categoryId: 2 },
    ],
    placements: [
      { ean: MILK, shelfId: '91208:05', shelfLevel: 1, isPrimary: true },
      { ean: BREAD, shelfId: '613:00', isPrimary: true },
      { ean: MILK, shelfId: '55488:02', isPrimary: false },
    ],
    categories: [
      { id: 1, name: 'Maito, juusto, munat ja rasvat', temperature: 'chilled' },
      { id: 2, name: 'Maidot', temperature: 'chilled', parentId: 1 },
    ],
  };
}

describe('validateNormalised', () => {
  it('accepts valid data', () => {
    expect(validateNormalised(valid())).toEqual([]);
  });

  it('rejects fields outside the contract, such as price', () => {
    const data = valid();
    data.products[0] = { ...data.products[0]!, price: 0.89 } as never;
    expect(validateNormalised(data)).toEqual([
      expect.stringMatching(/^product 6410405082657: \(record\) Unrecognized key/),
    ]);
  });

  it('rejects malformed fields, naming the record and field', () => {
    const data = valid();
    data.products[1] = { ean: '123', name: '', categoryId: 0 } as never;
    data.placements[1] = { ean: BREAD, shelfId: '613', shelfLevel: 0, isPrimary: true };
    data.categories[0] = { id: 1, name: 'x', temperature: 'warm' } as never;
    const errors = validateNormalised(data);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^product 123: ean not an EAN/),
        expect.stringMatching(/^product 123: name /),
        expect.stringMatching(/^product 123: categoryId /),
        expect.stringMatching(/^placement 6410405000001: shelfId not <departmentId>:<shelf>/),
        expect.stringMatching(/^placement 6410405000001: shelfLevel /),
        expect.stringMatching(/^category 1: temperature /),
      ]),
    );
  });

  it('rejects a duplicate EAN', () => {
    const data = valid();
    data.products.push({ ...data.products[0]! });
    expect(validateNormalised(data)).toContain(`product ${MILK}: duplicate EAN`);
  });

  it('requires exactly one primary placement per product', () => {
    const none = valid();
    none.placements = none.placements.filter((p) => p.ean !== BREAD);
    expect(validateNormalised(none)).toEqual([
      `product ${BREAD}: 0 primary placements, expected 1`,
    ]);

    const two = valid();
    two.placements.push({ ean: BREAD, shelfId: '613:01', isPrimary: true });
    expect(validateNormalised(two)).toEqual([`product ${BREAD}: 2 primary placements, expected 1`]);
  });

  it('rejects a placement for a product that does not exist', () => {
    const data = valid();
    data.placements.push({ ean: '6410405000099', shelfId: '613:01', isPrimary: false });
    expect(validateNormalised(data)).toEqual(['placement 6410405000099: no such product']);
  });

  it('rejects references to categories that do not exist', () => {
    const data = valid();
    data.products[1] = { ...data.products[1]!, categoryId: 9 };
    data.categories[1] = { ...data.categories[1]!, parentId: 8 };
    expect(validateNormalised(data)).toEqual([
      'category 2: no such parent 8',
      `product ${BREAD}: no such category 9`,
    ]);
  });

  it('rejects a duplicate category id', () => {
    const data = valid();
    data.categories.push({ id: 2, name: 'Piimät', temperature: 'chilled', parentId: 1 });
    expect(validateNormalised(data)).toEqual(['category 2: duplicate id']);
  });

  it('names a record without a key by its position', () => {
    const data = valid();
    data.categories.push({} as never);
    expect(validateNormalised(data)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^category #2: /)]),
    );
  });

  it('reports a broken product once, not again in the cross-checks', () => {
    const data = valid();
    data.products[1] = { ean: BREAD, name: '', categoryId: 99 };
    expect(validateNormalised(data)).toEqual([
      expect.stringMatching(/^product 6410405000001: name /),
    ]);
  });
});

describe('popularitySchema', () => {
  it('accepts positive scores and null for unranked products', () => {
    expect(popularitySchema.safeParse({ [MILK]: 22234.8, [BREAD]: null }).success).toBe(true);
    expect(popularitySchema.safeParse({}).success).toBe(true);
  });

  it('rejects 0, which must be written as null, and other non-positive or non-numbers', () => {
    for (const score of [0, -1, '12', undefined]) {
      expect(popularitySchema.safeParse({ [MILK]: score }).success).toBe(false);
    }
  });

  it('rejects a key that is not an EAN', () => {
    expect(popularitySchema.safeParse({ 'not-an-ean': 5 }).success).toBe(false);
  });
});
