import { describe, expect, it } from 'vitest';
import type { CuratedDepartment } from './departments';
import { cleanProduct, department, MILK_DEPARTMENT_ID, milkDepartment } from './fixtures';
import { departmentStats, departmentSummary, toContract } from './records';

const MILKS = 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat/maidot';

describe('departmentStats', () => {
  it('counts products, department-only products and distinct shelves per department', () => {
    const stats = departmentStats([
      cleanProduct('1', { shelfId: '91208:05' }),
      cleanProduct('2', { shelfId: '91208:00' }),
      cleanProduct('3', { shelfId: '91208:05' }),
      cleanProduct('4', { departmentId: '600', shelfId: '600:00' }),
    ]);
    expect(Object.fromEntries(stats)).toEqual({
      '91208': { products: 3, wide: 1, shelves: ['91208:00', '91208:05'] },
      '600': { products: 1, wide: 1, shelves: ['600:00'] },
    });
  });

  it('is empty for no products', () => {
    expect(departmentStats([]).size).toBe(0);
  });
});

describe('toContract', () => {
  const ids = { 'maito-juusto-munat-ja-rasvat': 1, [MILKS]: 3, uncategorised: 9 };

  it('builds a Product and a primary Placement for each product', () => {
    const milk = cleanProduct('6410405082657', {
      name: 'Pirkka suomalainen kevytmaito 1l',
      brand: 'Pirkka',
      categoryPath: MILKS,
      shelfId: '91208:05',
      shelfLevel: 1,
    });
    expect(toContract([milk], ids)).toEqual({
      products: [
        {
          ean: '6410405082657',
          name: 'Pirkka suomalainen kevytmaito 1l',
          brand: 'Pirkka',
          categoryId: 3,
        },
      ],
      placements: [{ ean: '6410405082657', shelfId: '91208:05', shelfLevel: 1, isPrimary: true }],
    });
  });

  it('leaves out brand and shelfLevel when the product has none', () => {
    const { products, placements } = toContract([cleanProduct('1')], ids);
    expect(products[0]).toEqual({ ean: '1', name: '1', categoryId: 9 });
    expect(placements[0]).toEqual({ ean: '1', shelfId: '91208:01', isPrimary: true });
  });

  it('throws, naming the product, when its category has no id', () => {
    expect(() => toContract([cleanProduct('1', { categoryPath: 'juomat' })], ids)).toThrow(
      'Product 1 has category juomat, which has no id.',
    );
  });
});

describe('departmentSummary', () => {
  const row = (id: string, kind: CuratedDepartment['kind']): CuratedDepartment => ({
    id,
    name: `dept ${id}`,
    kind,
    temperature: 'ambient',
  });

  it("adds the scrape's order, zone, product count and shelves to each row", () => {
    const seen = new Map([[MILK_DEPARTMENT_ID, milkDepartment]]);
    const stats = departmentStats([cleanProduct('1', { shelfId: '91208:05' })]);
    expect(departmentSummary([row('91208', 'aisle')], seen, stats)).toEqual([
      {
        id: '91208',
        name: 'dept 91208',
        kind: 'aisle',
        temperature: 'ambient',
        orderNumber: 68,
        zone: 'KERÄILY',
        products: 1,
        shelves: ['91208:05'],
      },
    ]);
  });

  it('keeps a department with no clean products, such as a junk one, with zero products', () => {
    const junk = department('585', 'Keräys- ja toimituskoodit', '');
    const [summary] = departmentSummary([row('585', 'junk')], new Map([['585', junk]]), new Map());
    expect(summary).toMatchObject({ id: '585', products: 0, shelves: [] });
  });

  it('leaves out departments that are only in the table, not in this scrape', () => {
    expect(departmentSummary([row('1', 'aisle')], new Map(), new Map())).toEqual([]);
  });
});
