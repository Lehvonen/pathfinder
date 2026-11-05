import { describe, expect, it } from 'vitest';
import type { Category, PrimaryPlacements } from '../types';
import { buildCategoryPlacements } from './category-placements';

const category = (id: number, parentId?: number): Category => ({
  id,
  name: `c${id}`,
  temperature: 'ambient',
  ...(parentId === undefined ? {} : { parentId }),
});

// 1 Maitotuotteet ─┬─ 2 Maidot
//                  └─ 3 Jogurtit
// 4 Leivät (no products)
const categories = [category(1), category(2, 1), category(3, 1), category(4)];

/** One product per [nodeId, categoryId] pair, with made-up EANs. */
function placementsOf(...pairs: [string, number][]): PrimaryPlacements {
  return Object.fromEntries(
    pairs.map(([nodeId, categoryId], i) => [String(i), { nodeId, categoryId }]),
  );
}

describe('buildCategoryPlacements', () => {
  it('sends a category to the node holding most of its products', () => {
    const placements = placementsOf(['maidot:0', 2], ['maidot:0', 2], ['kylmä:0', 2]);
    expect(buildCategoryPlacements(placements, categories)).toContainEqual({
      categoryId: 2,
      nodeId: 'maidot:0',
    });
  });

  it('counts the products of every subcategory for a parent category', () => {
    // Maidot alone favours maidot:0, but the dairy as a whole is mostly at jogurtit:0.
    const placements = placementsOf(
      ['maidot:0', 2],
      ['maidot:0', 2],
      ['jogurtit:0', 3],
      ['jogurtit:0', 3],
      ['jogurtit:0', 3],
    );
    const result = buildCategoryPlacements(placements, categories);
    expect(result).toContainEqual({ categoryId: 1, nodeId: 'jogurtit:0' });
    expect(result).toContainEqual({ categoryId: 2, nodeId: 'maidot:0' });
  });

  it('breaks a tie by node id, so a rebuild gives the same answer', () => {
    const placements = placementsOf(['b:0', 2], ['a:0', 2]);
    expect(buildCategoryPlacements(placements, categories)).toContainEqual({
      categoryId: 2,
      nodeId: 'a:0',
    });
  });

  it('leaves out categories with no placed product, and sorts by category id', () => {
    const placements = placementsOf(['jogurtit:0', 3], ['maidot:0', 2]);
    expect(buildCategoryPlacements(placements, categories).map((p) => p.categoryId)).toEqual([
      1, 2, 3,
    ]);
  });

  it('still places a category missing from the tree, and survives a looping tree', () => {
    const looping = [category(1, 2), category(2, 1)];
    const placements = placementsOf(['a:0', 1], ['b:0', 9]);
    expect(buildCategoryPlacements(placements, looping)).toEqual([
      { categoryId: 1, nodeId: 'a:0' },
      { categoryId: 2, nodeId: 'a:0' },
      { categoryId: 9, nodeId: 'b:0' },
    ]);
  });
});
