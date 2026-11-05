// Build-time only: the core tier's `category-placements.json`, where a generic list entry
// ("maito", any milk) is routed to (ARCHITECTURE.md §6, §9). Not part of the app bundle.
//
// ROUGH DRAFT, not a source of truth: ARCHITECTURE.md plans this table as hand-maintained.
// Until it is, every category goes to the node holding most of its products.
import { compareStrings } from '../compare';
import type { Category, CategoryPlacement, PrimaryPlacements } from '../types';

/** A category and every category above it, nearest first; stops on a broken or looping tree. */
function selfAndAncestors(categoryId: number, parentOf: ReadonlyMap<number, number>): number[] {
  const chain = [categoryId];
  let parent = parentOf.get(categoryId);
  while (parent !== undefined && !chain.includes(parent)) {
    chain.push(parent);
    parent = parentOf.get(parent);
  }
  return chain;
}

/**
 * Category → the node with the most products of that category and all its subcategories,
 * so "Maidot" goes where most milk is and "Maitotuotteet" where most dairy is. A tie goes
 * to the node id first in code-unit order, so a rebuild writes the same bytes. Categories
 * with no placed product are left out: there is nowhere to send them. Sorted by category
 * id.
 */
export function buildCategoryPlacements(
  placements: PrimaryPlacements,
  categories: readonly Category[],
): CategoryPlacement[] {
  const parentOf = new Map<number, number>();
  for (const category of categories) {
    if (category.parentId !== undefined) parentOf.set(category.id, category.parentId);
  }

  // categoryId → nodeId → products of that category or below it at that node
  const counts = new Map<number, Map<string, number>>();
  for (const { nodeId, categoryId } of Object.values(placements)) {
    for (const id of selfAndAncestors(categoryId, parentOf)) {
      let perNode = counts.get(id);
      if (perNode === undefined) {
        perNode = new Map();
        counts.set(id, perNode);
      }
      perNode.set(nodeId, (perNode.get(nodeId) ?? 0) + 1);
    }
  }

  const result: CategoryPlacement[] = [];
  for (const [categoryId, perNode] of counts) {
    let best: [string, number] | undefined;
    for (const entry of perNode) {
      if (
        best === undefined ||
        entry[1] > best[1] ||
        (entry[1] === best[1] && compareStrings(entry[0], best[0]) < 0)
      ) {
        best = entry;
      }
    }
    if (best !== undefined) result.push({ categoryId, nodeId: best[0] });
  }
  return result.sort((a, b) => a.categoryId - b.categoryId);
}
