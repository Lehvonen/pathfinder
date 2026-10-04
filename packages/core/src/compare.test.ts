import { describe, expect, it } from 'vitest';
import { compareProductRank, compareStrings, type RankedProduct } from './compare';

describe('compareStrings', () => {
  it('orders by code unit, not by locale', () => {
    // localeCompare would give a, ä, B, z in Finnish or a, ä, B, z / a, B, ä, z elsewhere
    expect(['a', 'B', 'ä', 'z'].sort(compareStrings)).toEqual(['B', 'a', 'z', 'ä']);
  });

  it('returns 0 for equal strings and the sign of the order otherwise', () => {
    expect(compareStrings('6410405082657', '6410405082657')).toBe(0);
    expect(compareStrings('1', '2')).toBe(-1);
    expect(compareStrings('2', '1')).toBe(1);
  });
});

describe('compareProductRank', () => {
  const product = (ean: string, name: string, popularity: number | null): RankedProduct => ({
    ean,
    name,
    popularity,
  });
  const eans = (products: RankedProduct[]) =>
    [...products].sort(compareProductRank).map((p) => p.ean);

  it('puts ranked products before unranked ones, whatever their names', () => {
    const ranked = product('1', 'a much longer name', 1);
    const unranked = product('2', 'a', null);
    expect(compareProductRank(ranked, unranked)).toBeLessThan(0);
    expect(compareProductRank(unranked, ranked)).toBeGreaterThan(0);
    expect(eans([product('2', 'a', null), product('1', 'a much longer name', 1)])).toEqual([
      '1',
      '2',
    ]);
  });

  it('orders ranked products by popularity, highest first', () => {
    expect(eans([product('1', 'a', 5), product('2', 'a', 900), product('3', 'a', 40)])).toEqual([
      '2',
      '3',
      '1',
    ]);
  });

  it('breaks a popularity tie with the shorter name', () => {
    expect(eans([product('1', 'kevytmaito 1l', 7), product('2', 'maito 1l', 7)])).toEqual([
      '2',
      '1',
    ]);
  });

  it('breaks a name-length tie with the EAN, for ranked and unranked products', () => {
    expect(eans([product('9', 'abc', 7), product('3', 'xyz', 7)])).toEqual(['3', '9']);
    expect(eans([product('9', 'abc', null), product('3', 'xyz', null)])).toEqual(['3', '9']);
  });

  it('returns 0 only for the same product', () => {
    const milk = product('6410405082657', 'maito', 7);
    expect(compareProductRank(milk, { ...milk })).toBe(0);
  });
});
