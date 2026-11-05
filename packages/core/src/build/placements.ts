// Build-time only: turns the normalised placements into the core tier's
// `placements-primary.json` (ARCHITECTURE.md §5, §7). Not part of the app bundle.
import { compareStrings } from '../compare';
import type { Placement, PrimaryPlacements, Product, Shelf } from '../types';

/** The department-wide shelf of a shelf id: "91208:05" → "91208:00". */
export function departmentShelfId(shelfId: string): string {
  const colon = shelfId.indexOf(':');
  const department = colon === -1 ? shelfId : shelfId.slice(0, colon);
  return `${department}:00`;
}

/** A primary placement that could not be given a node. Each one is a build error. */
export type UnplacedProduct = {
  ean: string;
  shelfId: string;
  reason: 'no-shelf' | 'no-product';
};

export type PrimaryPlacementsResult = {
  placements: PrimaryPlacements;
  /** Products placed through their department's `:00` shelf, not their own shelf. */
  fallbackCount: number;
  /** Never dropped silently: the build reports these and stops. */
  unplaced: UnplacedProduct[];
};

/**
 * EAN → `{ nodeId, categoryId }` for every primary placement. A shelf id with no shelf of
 * its own in the graph falls back to its department's `:00` shelf; on the department-level
 * map that is every shelf but `:00` itself. Keys are in EAN order, so a rebuild on the same
 * input writes the same bytes.
 */
export function buildPrimaryPlacements(
  placements: readonly Placement[],
  products: readonly Product[],
  shelves: readonly Shelf[],
): PrimaryPlacementsResult {
  const nodeByShelf = new Map(shelves.map((shelf) => [shelf.id, shelf.accessNodeId]));
  const categoryByEan = new Map(products.map((product) => [product.ean, product.categoryId]));
  const primary = placements
    .filter((placement) => placement.isPrimary)
    .sort((a, b) => compareStrings(a.ean, b.ean));

  const result: PrimaryPlacementsResult = { placements: {}, fallbackCount: 0, unplaced: [] };
  for (const { ean, shelfId } of primary) {
    const categoryId = categoryByEan.get(ean);
    if (categoryId === undefined) {
      result.unplaced.push({ ean, shelfId, reason: 'no-product' });
      continue;
    }
    let nodeId = nodeByShelf.get(shelfId);
    if (nodeId === undefined) {
      nodeId = nodeByShelf.get(departmentShelfId(shelfId));
      if (nodeId !== undefined) result.fallbackCount += 1;
    }
    if (nodeId === undefined) {
      result.unplaced.push({ ean, shelfId, reason: 'no-shelf' });
      continue;
    }
    result.placements[ean] = { nodeId, categoryId };
  }
  return result;
}
