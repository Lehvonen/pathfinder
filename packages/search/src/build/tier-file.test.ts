import { describe, expect, it } from 'vitest';
import { stableJson, toTierData } from './tier-file';
import type { TierProduct } from './tiers';

const products: TierProduct[] = [
  { ean: '6410405082657', name: 'Pirkka kevytmaito 1l', popularity: 900, categoryId: 3 },
  { ean: '2000818700008', name: 'Pirkka banaani', popularity: null, categoryId: 10 },
];

describe('toTierData', () => {
  it('writes the products as columns, in the order given, without popularity', () => {
    expect(toTierData(2, products)).toEqual({
      version: 1,
      tier: 2,
      eans: ['6410405082657', '2000818700008'],
      names: ['Pirkka kevytmaito 1l', 'Pirkka banaani'],
      categoryIds: [3, 10],
    });
  });

  it('writes an empty tier', () => {
    expect(toTierData(3, [])).toEqual({
      version: 1,
      tier: 3,
      eans: [],
      names: [],
      categoryIds: [],
    });
  });
});

describe('stableJson', () => {
  it('sorts object keys at every level and leaves array order alone', () => {
    expect(stableJson({ b: 1, a: { d: [3, 1, 2], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,1,2]},"b":1}',
    );
  });

  it('puts integer-like keys in numeric order', () => {
    expect(stableJson({ 10: ['x'], 2: ['y'] })).toBe('{"2":["y"],"10":["x"]}');
  });

  it('gives the same bytes whatever order the keys were built in', () => {
    const tier = toTierData(1, products);
    const reordered = {
      names: tier.names,
      categoryIds: tier.categoryIds,
      version: tier.version,
      eans: tier.eans,
      tier: tier.tier,
    };
    expect(stableJson(reordered)).toBe(stableJson(tier));
    expect(stableJson(tier)).toBe(
      '{"categoryIds":[3,10],"eans":["6410405082657","2000818700008"],' +
        '"names":["Pirkka kevytmaito 1l","Pirkka banaani"],"tier":1,"version":1}',
    );
  });
});
