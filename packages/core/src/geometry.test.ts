import { describe, expect, it } from 'vitest';
import { boundsOf, fitView, pathData, polylineLength } from './geometry';

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

describe('boundsOf', () => {
  it('gives the smallest box holding every point', () => {
    expect(
      boundsOf([
        [2, 5],
        [10, 1],
        [4, 9],
      ]),
    ).toEqual({ x: 2, y: 1, width: 8, height: 8 });
  });

  it('is a box of size 0 for one point, and at the origin for none', () => {
    expect(boundsOf([[3, 4]])).toEqual({ x: 3, y: 4, width: 0, height: 0 });
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('fitView', () => {
  it('pads the target and widens it to the screen shape, centred', () => {
    // 40 × 20 plus 5 m each side is 50 × 30; on a 2:1 screen that becomes 60 × 30.
    const view = fitView({ x: 10, y: 10, width: 40, height: 20 }, 2, 5);
    expect(view).toEqual({ x: 0, y: 5, width: 60, height: 30 });
  });

  it('makes it taller instead for a tall screen', () => {
    // 50 × 30 on a 1:2 (portrait) screen becomes 50 × 100.
    const view = fitView({ x: 10, y: 10, width: 40, height: 20 }, 0.5, 5);
    expect(view.width).toBe(50);
    expect(view.height).toBe(100);
    expect(view.y + view.height / 2).toBe(20);
  });

  it('never zooms in closer than the smallest size', () => {
    const view = fitView({ x: 5, y: 5, width: 0, height: 0 }, 1, 2, 20);
    expect(view).toEqual({ x: -5, y: -5, width: 20, height: 20 });
  });
});

describe('pathData', () => {
  it('draws the points as an SVG path', () => {
    expect(
      pathData([
        [0, 0],
        [0, 5.5],
        [3, 5.5],
      ]),
    ).toBe('M0 0 L0 5.5 L3 5.5');
  });
});
