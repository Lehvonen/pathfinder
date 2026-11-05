import type { Route } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import type { MapAreas } from '../route/loadRoutingData';
import {
  boundsOf,
  fitView,
  labelPoint,
  legsOf,
  legStates,
  pathData,
  shortLabel,
  storeBounds,
} from './mapView';

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

describe('storeBounds', () => {
  it('covers every area and every entrance', () => {
    const areas: MapAreas = {
      entrances: [{ id: 'sisäänkäynti-1', point: [120, 20] }],
      areas: [
        {
          id: 'a',
          kind: 'goods',
          polygon: [
            [0, 0],
            [10, 0],
            [10, 50],
          ],
        },
      ],
    };
    expect(storeBounds(areas)).toEqual({ x: 0, y: 0, width: 120, height: 50 });
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

describe('legs', () => {
  const route = {
    start: { nodeId: 'in', x: 0, y: 0 },
    stops: [
      {
        nodeId: 'a',
        x: 0,
        y: 5,
        leg: [
          [0, 0],
          [0, 5],
        ],
        legDistance: 5,
        order: 1,
        items: [],
      },
    ],
    end: {
      nodeId: 'out',
      x: 5,
      y: 5,
      leg: [
        [0, 5],
        [5, 5],
      ],
      legDistance: 5,
    },
    totalDistance: 10,
    estimatedMinutes: 1,
  } satisfies Route;

  it('lists one leg per stop, then the walk to the checkout', () => {
    expect(legsOf(route)).toEqual([
      [
        [0, 0],
        [0, 5],
      ],
      [
        [0, 5],
        [5, 5],
      ],
    ]);
  });

  it('marks the legs before the current stop walked, its own next, and the rest ahead', () => {
    expect(legStates(4, 0)).toEqual(['next', 'ahead', 'ahead', 'ahead']);
    expect(legStates(4, 2)).toEqual(['walked', 'walked', 'next', 'ahead']);
    // Every stop done: the walk to the checkout is next.
    expect(legStates(4, 3)).toEqual(['walked', 'walked', 'walked', 'next']);
    // At the checkout: everything walked.
    expect(legStates(4, 4)).toEqual(['walked', 'walked', 'walked', 'walked']);
  });

  it('draws a leg as an SVG path', () => {
    expect(
      pathData([
        [0, 0],
        [0, 5.5],
        [3, 5.5],
      ]),
    ).toBe('M0 0 L0 5.5 L3 5.5');
  });
});

describe('labels', () => {
  it('keeps a short label, and cuts a long one to its first part', () => {
    expect(shortLabel('Maitokaappi')).toBe('Maitokaappi');
    expect(shortLabel('Lihat, broilerit, kananmunat')).toBe('Lihat…');
    expect(shortLabel('Mehut, viinit, oluet & lonkerot')).toBe('Mehut…');
  });

  it('cuts a first part that is still too long, keeping ä and ö', () => {
    expect(shortLabel('Hedelmät & vihannekset ja kukat', 10)).toBe('Hedelmät…');
    expect(shortLabel('Pääsiäiskoristeet ja kynttilät', 10)).toBe('Pääsiäisk…');
  });

  it('puts a name in the middle of its area', () => {
    expect(
      labelPoint([
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ]),
    ).toEqual([5, 2]);
  });
});
