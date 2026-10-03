import { describe, expect, it } from 'vitest';
import {
  ancestry,
  assignIds,
  buildCategories,
  categoryPathOf,
  nameFromSlug,
  winner,
  type Temperature,
} from './categories';
import { cleanProduct } from './fixtures';

const MILKS = 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat/maidot';
const ICE_CREAM = 'pakasteet/jaatelot/jaatelopuikot';

const DAIRY = '91208';
const FREEZER = '600';
const temperatures = new Map<string, Temperature>([
  [DAIRY, 'chilled'],
  [FREEZER, 'frozen'],
]);

const product = (ean: string, categoryPath: string | null, departmentId: string) =>
  cleanProduct(ean, { categoryPath, departmentId });

/** Temperature of each category, keyed by name. */
const byName = (categories: { name: string; temperature: Temperature }[]) =>
  Object.fromEntries(categories.map((c) => [c.name, c.temperature]));

describe('categoryPathOf', () => {
  it.each([null, '', '/', ' / '])('treats %j as uncategorised', (path) => {
    expect(categoryPathOf(product('1', path, DAIRY))).toBe('uncategorised');
  });

  it.each(['/a/b/', 'a//b', ' a / b '])('drops empty segments from %j', (path) => {
    expect(categoryPathOf(product('1', path, DAIRY))).toBe('a/b');
  });

  it('gives those paths the same ids as the clean path', () => {
    const { ids } = buildCategories({
      products: [
        product('1', '/a/b/', DAIRY),
        product('2', 'a//b', DAIRY),
        product('3', 'a/b', DAIRY),
      ],
      ids: {},
      departmentTemperatures: temperatures,
    });
    expect(ids).toEqual({ a: 1, 'a/b': 2 });
  });
});

describe('ancestry', () => {
  it('lists every level from the root down', () => {
    expect(ancestry('a/b/c')).toEqual(['a', 'a/b', 'a/b/c']);
    expect(ancestry('a')).toEqual(['a']);
  });
});

describe('nameFromSlug', () => {
  it('names a category from the last slug of its path', () => {
    expect(nameFromSlug(MILKS)).toBe('Maidot');
    expect(nameFromSlug('juomat/tee-ja-haudutuspussit')).toBe('Tee ja haudutuspussit');
  });

  it('keeps the hyphen of a double-hyphen slug', () => {
    expect(nameFromSlug('a/viihde--ja-pienelektroniikka')).toBe('Viihde- ja pienelektroniikka');
  });
});

describe('assignIds', () => {
  it('numbers new paths in sorted order, parents before children', () => {
    expect(assignIds({}, ['a/b', 'a', 'c'])).toEqual({ a: 1, 'a/b': 2, c: 3 });
  });

  it('keeps existing ids, continues after the highest, and never drops a path', () => {
    const registry = { gone: 7, a: 2 };
    expect(assignIds(registry, ['a', 'b'])).toEqual({ gone: 7, a: 2, b: 8 });
    expect(registry).toEqual({ gone: 7, a: 2 }); // input untouched
  });
});

describe('winner', () => {
  it('picks the most common temperature', () => {
    expect(winner({ frozen: 1, chilled: 5, ambient: 2 })).toBe('chilled');
  });

  it('breaks a tie towards the colder temperature', () => {
    expect(winner({ frozen: 2, chilled: 2, ambient: 1 })).toBe('frozen');
    expect(winner({ frozen: 0, chilled: 3, ambient: 3 })).toBe('chilled');
  });

  it('defaults to ambient with no votes', () => {
    expect(winner({ frozen: 0, chilled: 0, ambient: 0 })).toBe('ambient');
  });
});

describe('buildCategories', () => {
  it('builds the tree with parents, ids and temperatures', () => {
    const { categories, ids } = buildCategories({
      products: [product('1', MILKS, DAIRY)],
      ids: {},
      departmentTemperatures: temperatures,
    });
    expect(ids).toEqual({
      'maito-juusto-munat-ja-rasvat': 1,
      'maito-juusto-munat-ja-rasvat/maidot-ja-piimat': 2,
      [MILKS]: 3,
    });
    expect(categories).toEqual([
      { id: 1, name: 'Maito juusto munat ja rasvat', temperature: 'chilled' },
      { id: 2, name: 'Maidot ja piimat', temperature: 'chilled', parentId: 1 },
      { id: 3, name: 'Maidot', temperature: 'chilled', parentId: 2 },
    ]);
  });

  it('gives a parent the vote of everything below it, and reports it as mixed', () => {
    const { categories, mixed } = buildCategories({
      products: [
        product('1', 'kauppa/maidot', DAIRY),
        product('2', 'kauppa/maidot', DAIRY),
        product('3', 'kauppa/jaatelot', FREEZER),
      ],
      ids: {},
      departmentTemperatures: temperatures,
    });
    expect(categories.find((c) => c.name === 'Kauppa')?.temperature).toBe('chilled');
    expect(mixed).toEqual([{ path: 'kauppa', votes: { frozen: 1, chilled: 2, ambient: 0 } }]);
  });

  it('uses given names and overrides, and reports the rest as unnamed', () => {
    const { categories, unnamed } = buildCategories({
      products: [product('1', ICE_CREAM, DAIRY)],
      ids: {},
      departmentTemperatures: temperatures,
      names: new Map([['pakasteet', 'Pakasteet']]),
      overrides: new Map([[ICE_CREAM, 'frozen']]),
    });
    expect(categories[0]?.name).toBe('Pakasteet');
    expect(categories.at(-1)?.temperature).toBe('frozen'); // the vote said chilled
    expect(unnamed).toEqual(['pakasteet/jaatelot', ICE_CREAM]);
  });

  it('puts products without a category under one top-level category', () => {
    const { categories } = buildCategories({
      products: [product('1', null, DAIRY)],
      ids: {},
      departmentTemperatures: temperatures,
    });
    expect(categories).toEqual([{ id: 1, name: 'Uncategorised', temperature: 'chilled' }]);
  });

  it('treats a department without a temperature as no vote', () => {
    const { categories } = buildCategories({
      products: [product('1', 'kauppa', 'unknown')],
      ids: {},
      departmentTemperatures: temperatures,
    });
    expect(categories[0]?.temperature).toBe('ambient');
  });

  it('keeps ids stable across runs and omits categories no longer in use', () => {
    const first = buildCategories({
      products: [product('1', MILKS, DAIRY), product('2', ICE_CREAM, FREEZER)],
      ids: {},
      departmentTemperatures: temperatures,
    });
    const second = buildCategories({
      products: [product('2', ICE_CREAM, FREEZER), product('3', 'juomat', DAIRY)],
      ids: first.ids,
      departmentTemperatures: temperatures,
    });
    expect(second.ids[ICE_CREAM]).toBe(first.ids[ICE_CREAM]);
    expect(second.ids[MILKS]).toBe(first.ids[MILKS]); // reserved, not reused
    expect(second.ids.juomat).toBe(Math.max(...Object.values(first.ids)) + 1);
    expect(second.categories.map((c) => c.name)).toEqual([
      'Pakasteet',
      'Jaatelot',
      'Jaatelopuikot',
      'Juomat',
    ]);
  });

  describe('overrides', () => {
    const run = (products: ReturnType<typeof product>[], overrides: [string, Temperature][]) =>
      buildCategories({
        products,
        ids: {},
        departmentTemperatures: temperatures,
        overrides: new Map(overrides),
      });

    it('lets the parents of an overridden leaf follow the override', () => {
      const { categories } = run([product('1', ICE_CREAM, DAIRY)], [[ICE_CREAM, 'frozen']]);
      expect(byName(categories)).toEqual({
        Pakasteet: 'frozen',
        Jaatelot: 'frozen',
        Jaatelopuikot: 'frozen',
      });
    });

    it("leaves the children's temperature alone when a parent is overridden", () => {
      const { categories } = run(
        [product('1', 'kauppa/maidot', DAIRY), product('2', 'kauppa/kahvit', 'unknown')],
        [['kauppa', 'ambient']],
      );
      expect(byName(categories)).toEqual({
        Kauppa: 'ambient',
        Maidot: 'chilled',
        Kahvit: 'ambient',
      });
    });

    it("counts a nested override above it, not the ancestor's", () => {
      const { mixed } = run(
        [product('1', 'a/b/c', DAIRY), product('2', 'a/b/c', DAIRY), product('3', 'a/x', DAIRY)],
        [
          ['a/b/c', 'frozen'],
          ['a/b', 'ambient'],
        ],
      );
      // a/b is overridden, so not reported; above it, a counts the leaf's frozen votes
      expect(mixed).toEqual([{ path: 'a', votes: { frozen: 2, chilled: 1, ambient: 0 } }]);
    });

    it('lets a product whose department has no temperature vote the override', () => {
      const { categories } = run([product('1', 'a/b', 'unknown')], [['a/b', 'frozen']]);
      expect(byName(categories)).toEqual({ A: 'frozen', B: 'frozen' });
    });

    it('reports mixed votes after the overrides, and not overridden categories', () => {
      const { mixed } = run(
        [product('1', 'kauppa/jaatelot', DAIRY), product('2', 'kauppa/maidot', DAIRY)],
        [['kauppa/jaatelot', 'frozen']],
      );
      expect(mixed).toEqual([{ path: 'kauppa', votes: { frozen: 1, chilled: 1, ambient: 0 } }]);
    });
  });
});
