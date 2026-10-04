import type { Category } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import type { TierProduct } from './tiers';
import {
  MAX_ALIAS_KEY_LENGTH,
  MAX_ALIAS_TERMS,
  validateAliases,
  validateBuild,
  type BuildOutput,
} from './validate';

// 10 food (11 is a leaf under it), 50 excluded
const categories: Category[] = [
  { id: 10, name: 'Ruoka', temperature: 'ambient' },
  { id: 11, name: 'Maidot', temperature: 'chilled', parentId: 10 },
  { id: 50, name: 'Vaatteet', temperature: 'ambient' },
];
const p = (ean: string, categoryId: number, popularity: number | null): TierProduct => ({
  ean,
  name: `p${ean}`,
  popularity,
  categoryId,
});
const milk = p('1', 11, 90);
const bread = p('2', 10, 50);
const sock = p('3', 50, 99);
const unranked = p('4', 10, null);

/** A valid build; each test breaks one thing. */
const valid = (): BuildOutput => ({
  products: [milk, bread, sock, unranked],
  tiers: { 1: [milk], 2: [bread], 3: [sock, unranked] },
  categories,
  categoryTop: { 10: ['1', '2', '4'], 11: ['1'], 50: ['3'] },
  excluded: [50],
});

describe('validateBuild', () => {
  it('passes a valid build', () => {
    expect(validateBuild(valid())).toEqual([]);
  });

  it('reports a product in two tiers', () => {
    const output = { ...valid(), tiers: { 1: [milk], 2: [bread, milk], 3: [sock, unranked] } };
    expect(validateBuild(output)).toContain('tier 2: 1 is also in tier 1');
  });

  it('reports a product in no tier, and a tier total that does not match', () => {
    const output = { ...valid(), tiers: { 1: [milk], 2: [bread], 3: [sock] } };
    expect(validateBuild(output)).toEqual([
      '4 is in no tier',
      'tiers hold 3 products, the catalogue has 4',
      'category-top 10: 4 is in no tier',
    ]);
  });

  it('reports an unranked product in tier 1 or 2, but allows it in tier 3', () => {
    const output = { ...valid(), tiers: { 1: [milk], 2: [bread, unranked], 3: [sock] } };
    expect(validateBuild(output)).toEqual(['tier 2: 4 is unranked']);
  });

  it('reports an excluded category in tier 1 or 2, through its top level', () => {
    const output = { ...valid(), tiers: { 1: [sock, milk], 2: [bread], 3: [unranked] } };
    expect(validateBuild(output)).toEqual(['tier 1: 3 is in excluded category 50']);
  });

  it('reports a tier out of rank order', () => {
    const output = { ...valid(), tiers: { 1: [bread, milk], 2: [], 3: [sock, unranked] } };
    expect(validateBuild(output)).toEqual(['tier 1: 1 is out of rank order']);
  });

  it('reports an unknown category', () => {
    const stray = p('5', 99, 10);
    const output = {
      ...valid(),
      products: [...valid().products, stray],
      tiers: { 1: [milk], 2: [bread], 3: [sock, stray, unranked] },
    };
    expect(validateBuild(output)).toEqual(['tier 3: 5 has unknown category 99']);
  });

  it('reports a category-top EAN that is in no tier', () => {
    const output = { ...valid(), categoryTop: { 11: ['1', '999'] } };
    expect(validateBuild(output)).toEqual(['category-top 11: 999 is in no tier']);
  });
});

describe('validateAliases', () => {
  it('passes valid aliases', () => {
    expect(
      validateAliases({ vessapaperi: ['wc-paperi', 'talouspaperi'], leipä: ['leivät'] }),
    ).toEqual([]);
  });

  it('rejects anything that is not an object of lists', () => {
    for (const bad of [null, [], 'maito', 3]) {
      expect(validateAliases(bad)).toEqual(['aliases must be an object of word → terms']);
    }
    expect(validateAliases({ maito: 'maidot' })).toEqual([
      'alias "maito": terms must be a non-empty list',
    ]);
    expect(validateAliases({ maito: [] })).toEqual([
      'alias "maito": terms must be a non-empty list',
    ]);
  });

  it('rejects a key that folds to more than one word, or to nothing', () => {
    expect(validateAliases({ 'wc-paperi': ['vessapaperi'] })).toEqual([
      'alias "wc-paperi": key must be one word',
    ]);
    expect(validateAliases({ '—': ['x'] })).toEqual(['alias "—": key has no letters or digits']);
  });

  it('rejects two keys that fold to the same word', () => {
    expect(validateAliases({ leipä: ['leivät'], Leipa: ['leipä'] })).toEqual([
      'alias "Leipa": same word as alias "leipä"',
    ]);
  });

  it(`allows keys of ${MAX_ALIAS_KEY_LENGTH} characters and rejects longer ones`, () => {
    expect(validateAliases({ ['a'.repeat(MAX_ALIAS_KEY_LENGTH)]: ['b'] })).toEqual([]);
    const long = 'a'.repeat(MAX_ALIAS_KEY_LENGTH + 1);
    expect(validateAliases({ [long]: ['b'] })).toEqual([
      `alias "${long}": key is longer than ${MAX_ALIAS_KEY_LENGTH} characters`,
    ]);
  });

  it(`allows ${MAX_ALIAS_TERMS} terms and rejects more`, () => {
    const terms = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(validateAliases({ x: terms(MAX_ALIAS_TERMS) })).toEqual([]);
    expect(validateAliases({ x: terms(MAX_ALIAS_TERMS + 1) })).toEqual([
      `alias "x": more than ${MAX_ALIAS_TERMS} terms`,
    ]);
  });

  it('rejects a term that is not a string or folds to nothing', () => {
    expect(validateAliases({ x: ['ok', 7, ' - '] })).toEqual([
      'alias "x": term 7 has no letters or digits',
      'alias "x": term " - " has no letters or digits',
    ]);
  });
});
