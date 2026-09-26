import { describe, expect, it } from 'vitest';
import { polylineLength } from './geometry';

describe('polylineLength', () => {
  it('is 0 for empty and single-point lines', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([[1, 1]])).toBe(0);
  });

  it('sums segment lengths', () => {
    expect(
      polylineLength([
        [0, 0],
        [3, 4],
        [3, 10],
      ]),
    ).toBe(11);
  });
});
