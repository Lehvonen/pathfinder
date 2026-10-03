/*
 * Builds the records normalise.ts writes, from the cleaned products. Pure, so the shapes
 * of products.json, placements.json and departments.json are tested here rather than
 * only checked at runtime.
 */
import type { Placement, Product } from '@pathfinder/core';
import { categoryPathOf, type CategoryIds } from './categories';
import { DEPARTMENT_WIDE_SHELF, type CleanProduct } from './clean';
import { compareStrings } from './compare';
import type { CuratedDepartment } from './departments';
import type { RawDepartment } from './load';

export interface DepartmentStats {
  products: number;
  wide: number; // products on the department-wide shelf `00`
  shelves: string[]; // distinct shelf ids, sorted
}

/** Per department: how many clean products, how many department-only, which shelves. */
export function departmentStats(products: CleanProduct[]): Map<string, DepartmentStats> {
  const counts = new Map<string, { products: number; wide: number; shelves: Set<string> }>();
  for (const product of products) {
    const s = counts.get(product.departmentId) ?? { products: 0, wide: 0, shelves: new Set() };
    s.products++;
    if (product.shelfId.endsWith(`:${DEPARTMENT_WIDE_SHELF}`)) s.wide++;
    s.shelves.add(product.shelfId);
    counts.set(product.departmentId, s);
  }
  return new Map(
    [...counts].map(([id, s]) => [
      id,
      { products: s.products, wide: s.wide, shelves: [...s.shelves].sort(compareStrings) },
    ]),
  );
}

/** The contract's Product and Placement for each clean product: one primary placement. */
export function toContract(
  products: CleanProduct[],
  ids: CategoryIds,
): { products: Product[]; placements: Placement[] } {
  return {
    products: products.map((p) => {
      const path = categoryPathOf(p);
      const categoryId = ids[path];
      if (categoryId === undefined) {
        throw new Error(`Product ${p.ean} has category ${path}, which has no id.`);
      }
      return { ean: p.ean, name: p.name, ...(p.brand && { brand: p.brand }), categoryId };
    }),
    placements: products.map((p) => ({
      ean: p.ean,
      shelfId: p.shelfId,
      ...(p.shelfLevel !== undefined && { shelfLevel: p.shelfLevel }),
      isPrimary: true,
    })),
  };
}

export type DepartmentSummaryRow = CuratedDepartment & {
  orderNumber: number | null;
  zone: string | null;
  products: number;
  shelves: string[];
};

/**
 * departments.json: each department of this scrape, its reviewed row plus what the scrape
 * says about it. Departments only in the table (not in this scrape) are left out.
 */
export function departmentSummary(
  table: CuratedDepartment[],
  seen: ReadonlyMap<string, RawDepartment>,
  stats: ReadonlyMap<string, DepartmentStats>,
): DepartmentSummaryRow[] {
  return table.flatMap((row) => {
    const scraped = seen.get(row.id);
    if (!scraped) return [];
    const s = stats.get(row.id);
    return [
      {
        ...row,
        orderNumber: scraped.orderNumber,
        zone: scraped.zone,
        products: s?.products ?? 0,
        shelves: s?.shelves ?? [],
      },
    ];
  });
}
