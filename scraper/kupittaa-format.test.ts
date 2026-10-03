import { describe, expect, it } from 'vitest';
import {
  categorySlugs,
  csvCell,
  formatUnitPrice,
  parseRecords,
  popularityRanks,
  toQueueItem,
  type QueueItem,
} from './kupittaa-format';

/** A listing product, shaped like K-Ruoka's product-search result. */
const milk = {
  ean: '6410405082657',
  localizedName: { finnish: 'Pirkka suomalainen kevytmaito 1l' },
  brand: { name: 'Pirkka' },
  popularity: 22234.8,
  productAttributes: { urlSlug: 'pirkka-kevytmaito-1-l-6410405082657' },
  category: {
    path: 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat/maidot',
    tree: [
      { slug: 'maito-juusto-munat-ja-rasvat' },
      { slug: 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat' },
      { slug: 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat/maidot' },
    ],
  },
  mobilescan: {
    pricing: { normal: { price: 0.89, unit: 'kpl', unitPrice: { value: 0.89, unit: 'l' } } },
  },
};

function item(ean: string, popularity: number): QueueItem {
  return {
    ean,
    name: null,
    brand: null,
    price: null,
    unitPrice: null,
    slug: null,
    popularity,
    categoryPath: null,
  };
}

describe('toQueueItem', () => {
  it('reads a listing product', () => {
    expect(toQueueItem(milk)).toEqual({
      ean: '6410405082657',
      name: 'Pirkka suomalainen kevytmaito 1l',
      brand: 'Pirkka',
      price: 0.89,
      unitPrice: '0,89 €/l',
      slug: 'pirkka-kevytmaito-1-l-6410405082657',
      popularity: 22234.8,
      categoryPath: 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat/maidot',
    });
  });

  it('returns null for a product without an EAN', () => {
    expect(toQueueItem({ ...milk, ean: undefined })).toBeNull();
    expect(toQueueItem({ ...milk, ean: '' })).toBeNull();
  });

  it('fills missing fields with null and popularity with 0', () => {
    expect(toQueueItem({ ean: '1', localizedName: 'Plain name' })).toEqual({
      ean: '1',
      name: 'Plain name',
      brand: null,
      price: null,
      unitPrice: null,
      slug: null,
      popularity: 0,
      categoryPath: null,
    });
  });
});

describe('categorySlugs', () => {
  it('lists the tree slugs from the root down, skipping bad entries', () => {
    const product = { category: { tree: [{ slug: 'a' }, null, { name: 'x' }, { slug: 'a/b' }] } };
    expect(categorySlugs(product)).toEqual(['a', 'a/b']);
    expect(categorySlugs({})).toEqual([]);
  });
});

describe('formatUnitPrice', () => {
  it('formats with a decimal comma and two decimals', () => {
    expect(formatUnitPrice({ unitPrice: { value: 1.5, unit: 'kg' } })).toBe('1,50 €/kg');
  });

  it('is null without a value or a unit', () => {
    expect(formatUnitPrice(null)).toBeNull();
    expect(formatUnitPrice({})).toBeNull();
    expect(formatUnitPrice({ unitPrice: { value: 1.5 } })).toBeNull();
    expect(formatUnitPrice({ unitPrice: { unit: 'kg' } })).toBeNull();
  });

  it('formats a zero price', () => {
    expect(formatUnitPrice({ unitPrice: { value: 0, unit: 'kpl' } })).toBe('0,00 €/kpl');
  });
});

describe('parseRecords', () => {
  it('reads one record per line and counts a half-written last line as damaged', () => {
    const text = '{"ean":"1"}\n{"ean":"2"}\n{"ean":"3","na';
    expect(parseRecords(text)).toEqual({ records: [{ ean: '1' }, { ean: '2' }], damaged: 1 });
  });

  it('ignores blank lines and non-object JSON', () => {
    expect(parseRecords('\n{"ean":"1"}\n\n42\n')).toEqual({ records: [{ ean: '1' }], damaged: 0 });
  });

  it('reads an empty file as no records', () => {
    expect(parseRecords('')).toEqual({ records: [], damaged: 0 });
  });
});

describe('popularityRanks', () => {
  it('ranks by popularity, ties sharing a rank and the next rank skipping', () => {
    const ranks = popularityRanks([item('a', 5), item('b', 9), item('c', 5), item('d', 1)]);
    expect(Object.fromEntries(ranks)).toEqual({ b: 1, a: 2, c: 2, d: 4 });
  });

  it('gives every zero score the shared last rank', () => {
    const ranks = popularityRanks([item('a', 0), item('b', 3), item('c', 0), item('d', 0)]);
    expect(Object.fromEntries(ranks)).toEqual({ b: 1, a: 2, c: 2, d: 2 });
  });

  it('handles empty input and a single item', () => {
    expect(popularityRanks([]).size).toBe(0);
    expect(Object.fromEntries(popularityRanks([item('a', 0)]))).toEqual({ a: 1 });
  });
});

describe('csvCell', () => {
  it('leaves plain text and numbers as they are', () => {
    expect(csvCell('Pirkka')).toBe('Pirkka');
    expect(csvCell(68)).toBe('68');
  });

  it('writes null and undefined as empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it.each([
    ['a;b', '"a;b"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['cr\rhere', '"cr\rhere"'],
  ])('quotes %j', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });
});
