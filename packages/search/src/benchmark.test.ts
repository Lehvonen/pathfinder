import { describe, expect, it } from 'vitest';
import { BENCH_SEQUENCES, percentile, prefixes } from './benchmark';

describe('prefixes', () => {
  it('lists every prefix as typed, one character at a time', () => {
    expect(prefixes('mai')).toEqual(['m', 'ma', 'mai']);
    expect(prefixes('a b')).toEqual(['a', 'a ', 'a b']);
    expect(prefixes('')).toEqual([]);
  });
});

describe('percentile', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1 … 100

  it('picks the nearest-rank value', () => {
    expect(percentile(values, 50)).toBe(51);
    expect(percentile(values, 95)).toBe(96);
  });

  it('returns the largest value for p = 100 and the only value of a single sample', () => {
    expect(percentile(values, 100)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
  });

  it('is NaN with no values', () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe('BENCH_SEQUENCES', () => {
  it('includes the slow cases the benchmark exists to watch', () => {
    expect(BENCH_SEQUENCES).toEqual(
      expect.arrayContaining(['maito laktoositonx', 'xyz', 'pirkka zzz']),
    );
  });
});
