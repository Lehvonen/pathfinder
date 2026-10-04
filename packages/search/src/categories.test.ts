import type { Category } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import { createCategoryIndex, MAX_CATEGORIES } from './categories';
import { aliases, categories, categoryRank } from './fixtures';
import { parseQuery, prepareAliases } from './query';

const prepared = prepareAliases(aliases);
const index = createCategoryIndex(categories, categoryRank);
const names = (raw: string, using = index) =>
  using.match(parseQuery(raw, prepared)).map((c) => c.name);

const category = (id: number, name: string, parentId?: number): Category => ({
  id,
  name,
  temperature: 'ambient',
  ...(parentId === undefined ? {} : { parentId }),
});

describe('category matching', () => {
  it('offers no categories for words of 2 letters, and some from 3', () => {
    expect(names('ma')).toEqual([]);
    expect(names('mai')).not.toEqual([]);
  });

  it('prefers the most specific category over its ancestors', () => {
    // "Maito, juusto, munat ja rasvat" also matches, but "Maitotuotteet" is inside it
    expect(names('maito')).toEqual(['Maitotuotteet']);
  });

  it('keeps an ancestor that matches better than its matching descendant', () => {
    // alias leipä → leivät: "Leivät" is exact (3), "Ruisleivät" only contains it (1);
    // "Leivät, keksit ja leivonnaiset" gives way to "Leivät"
    expect(names('leipä ')).toEqual(['Leivät', 'Ruisleivät']);
  });

  it('matches a whole category name, word for word', () => {
    expect(names('hedelmät ja vihannekset')).toEqual(['Hedelmät ja vihannekset']);
  });

  it('matches plurals and accents through folding', () => {
    expect(names('banaani')).toEqual(['Banaanit']);
    expect(names('pesuaine')).toEqual(['Pesuaineet']);
  });

  it('returns nothing when no name matches every word', () => {
    expect(names('maito vihannekset')).toEqual([]);
  });

  it('never offers a category without products', () => {
    const empty = createCategoryIndex([category(1, 'Maidot')], {});
    expect(names('maidot', empty)).toEqual([]);
  });
});

describe('category exclusions', () => {
  it('leaves out a category whose name contains an excluded text', () => {
    const using = createCategoryIndex([category(1, 'Broileri'), category(2, 'Kananmunat')], {
      1: 0,
      2: 0,
    });
    const query = parseQuery('kana ', prepareAliases({ kana: ['broileri', '-muna'] }));
    expect(using.match(query).map((c) => c.name)).toEqual(['Broileri']);
  });
});

describe('category ordering', () => {
  it('orders by score: exact, then all word starts, then anywhere', () => {
    const using = createCategoryIndex(
      [category(1, 'Juustoraaste'), category(2, 'Kermajuusto'), category(3, 'Juusto')],
      { 1: 0, 2: 0, 3: 9 },
    );
    expect(names('juusto', using)).toEqual(['Juusto', 'Juustoraaste', 'Kermajuusto']);
  });

  it('puts deeper categories first when scores tie, even if less popular', () => {
    const using = createCategoryIndex(
      [category(1, 'Juomat'), category(2, 'Mehut', 1), category(3, 'Mehujuomat')],
      { 1: 0, 2: 50, 3: 0 },
    );
    expect(names('meh', using)).toEqual(['Mehut', 'Mehujuomat']);
  });

  it('breaks a depth tie by the popularity of the best product, then by id', () => {
    const using = createCategoryIndex(
      [category(4, 'Teet A'), category(3, 'Teet B'), category(2, 'Teet C')],
      { 4: 7, 3: 2, 2: 7 },
    );
    expect(names('teet', using)).toEqual(['Teet B', 'Teet C', 'Teet A']);
  });

  it(`shows at most ${MAX_CATEGORIES}`, () => {
    const many = (n: number) =>
      createCategoryIndex(
        Array.from({ length: n }, (_, i) => category(i + 1, `Kahvi ${i + 1}`)),
        Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, i])),
      );
    expect(names('kahvi', many(3))).toHaveLength(3);
    expect(names('kahvi', many(4))).toEqual(['Kahvi 1', 'Kahvi 2', 'Kahvi 3']);
  });
});

describe('subtrees', () => {
  it('marks a category and every descendant, nothing else', () => {
    const mask = index.subtreeMask(1);
    const marked = categories.filter((c) => mask[c.id] === 1).map((c) => c.id);
    expect(marked).toEqual([1, 2, 3, 4]);
    expect(index.subtreeMask(10)[10]).toBe(1);
    expect(index.subtreeMask(10)[9]).toBe(0);
  });

  it('returns the same mask on repeated calls', () => {
    expect(index.subtreeMask(5)).toBe(index.subtreeMask(5));
  });

  it('lists direct children only', () => {
    expect(index.children(1).map((c) => c.name)).toEqual(['Maitotuotteet']);
    expect(index.children(2).map((c) => c.name)).toEqual(['Maidot', 'Juustot']);
    expect(index.children(10)).toEqual([]);
  });
});
