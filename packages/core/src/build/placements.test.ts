import { describe, expect, it } from 'vitest';
import type { Placement, Product, Shelf } from '../types';
import { buildPrimaryPlacements, departmentShelfId } from './placements';

const shelf = (id: string, accessNodeId: string): Shelf => ({ id, accessNodeId, polygon: [] });
const product = (ean: string, categoryId: number): Product => ({ ean, name: ean, categoryId });
const placed = (ean: string, shelfId: string, isPrimary = true): Placement => ({
  ean,
  shelfId,
  isPrimary,
});

// One department with only its `:00` shelf, as on the department-level map, and one
// department that also has a shelf of its own.
const shelves = [
  shelf('541:00', 'maidot:0'),
  shelf('91208:00', 'leipä:0'),
  shelf('91208:05', 'leipä:5'),
];
const products = [product('1', 10), product('2', 20), product('3', 30), product('4', 40)];

describe('departmentShelfId', () => {
  it("gives the department's :00 shelf", () => {
    expect(departmentShelfId('91208:05')).toBe('91208:00');
    expect(departmentShelfId('541:00')).toBe('541:00');
  });

  it('treats an id with no shelf part as the department', () => {
    expect(departmentShelfId('541')).toBe('541:00');
  });
});

describe('buildPrimaryPlacements', () => {
  it("places a product on its own shelf's node, with its category", () => {
    const { placements, fallbackCount } = buildPrimaryPlacements(
      [placed('1', '91208:05'), placed('2', '541:00')],
      products,
      shelves,
    );
    expect(placements).toEqual({
      '1': { nodeId: 'leipä:5', categoryId: 10 },
      '2': { nodeId: 'maidot:0', categoryId: 20 },
    });
    expect(fallbackCount).toBe(0);
  });

  it("falls back to the department's :00 shelf, and counts it", () => {
    const { placements, fallbackCount } = buildPrimaryPlacements(
      [placed('1', '541:07'), placed('2', '91208:99')],
      products,
      shelves,
    );
    expect(placements['1']).toEqual({ nodeId: 'maidot:0', categoryId: 10 });
    expect(placements['2']).toEqual({ nodeId: 'leipä:0', categoryId: 20 });
    expect(fallbackCount).toBe(2);
  });

  it('reports a shelf with no match even after the fallback, and never places it', () => {
    const result = buildPrimaryPlacements([placed('1', '777:03')], products, shelves);
    expect(result.placements).toEqual({});
    expect(result.unplaced).toEqual([{ ean: '1', shelfId: '777:03', reason: 'no-shelf' }]);
    expect(result.fallbackCount).toBe(0);
  });

  it('reports a placement whose product is missing', () => {
    const result = buildPrimaryPlacements([placed('9', '541:00')], products, shelves);
    expect(result.placements).toEqual({});
    expect(result.unplaced).toEqual([{ ean: '9', shelfId: '541:00', reason: 'no-product' }]);
  });

  it('uses primary placements only', () => {
    const { placements } = buildPrimaryPlacements(
      [placed('1', '541:00'), placed('1', '91208:05', false)],
      products,
      shelves,
    );
    expect(placements).toEqual({ '1': { nodeId: 'maidot:0', categoryId: 10 } });
  });

  it('writes keys in EAN order, whatever the input order', () => {
    const { placements } = buildPrimaryPlacements(
      [placed('4', '541:00'), placed('2', '541:00'), placed('3', '541:00')],
      products,
      shelves,
    );
    expect(Object.keys(placements)).toEqual(['2', '3', '4']);
  });

  it('does not change the placements it is given', () => {
    const input = [placed('2', '541:00'), placed('1', '541:00')];
    buildPrimaryPlacements(input, products, shelves);
    expect(input.map((p) => p.ean)).toEqual(['2', '1']);
  });
});
