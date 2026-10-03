import { describe, expect, it } from 'vitest';
import { compareStrings } from './compare';

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
