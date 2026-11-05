import type { Route } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import {
  drawOrder,
  LABEL_MIN_PIXELS_PER_METRE,
  labelPoint,
  legsOf,
  legStates,
  routeFocus,
  screenView,
  shortLabel,
  showsLabels,
} from './mapView';

describe('screenView', () => {
  const focus = { x: 10, y: 10, width: 40, height: 20 };

  it('fits the focus to a phone-shaped map, and measures a metre in screen pixels', () => {
    // 40 × 20 plus 4 m padding is 48 × 28; on a 360 × 480 map that becomes 48 × 64.
    const shown = screenView(focus, { width: 360, height: 480 })!;
    expect(shown.view.width).toBe(48);
    expect(shown.view.height).toBe(64);
    expect(shown.pixelsPerMetre).toBe(7.5);
  });

  it('uses the width, not the height, for a landscape map too', () => {
    // 48 × 28 on a 600 × 200 map becomes 84 × 28: 600 px over 84 m.
    const shown = screenView(focus, { width: 600, height: 200 })!;
    expect(shown.view.width).toBe(84);
    expect(shown.pixelsPerMetre).toBeCloseTo(600 / 84);
  });

  it('is null until the map is measured, or while it has no size', () => {
    expect(screenView(focus, null)).toBeNull();
    expect(screenView(focus, { width: 360, height: 0 })).toBeNull();
    expect(screenView(focus, { width: 0, height: 480 })).toBeNull();
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

  it('frames the whole route, and gives the same object for the same route', () => {
    expect(routeFocus(route)).toEqual({ x: 0, y: 0, width: 5, height: 5 });
    // Same object: a memoised map is not redrawn when nothing changed.
    expect(routeFocus(route)).toBe(routeFocus(route));
    expect(routeFocus({ ...route })).not.toBe(routeFocus(route));
  });

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
});

describe('drawOrder', () => {
  it('draws legs ahead first, then walked, then the next one last, on top', () => {
    expect(drawOrder(['walked', 'next', 'ahead', 'ahead'])).toEqual([2, 3, 0, 1]);
    expect(drawOrder(['next', 'ahead'])).toEqual([1, 0]);
  });
});

describe('labels', () => {
  it('shows names from 7 screen pixels per metre, not below', () => {
    expect(LABEL_MIN_PIXELS_PER_METRE).toBe(7);
    expect(showsLabels(6.99)).toBe(false);
    expect(showsLabels(7)).toBe(true);
    // A whole store on a phone is about 3.4 px/m: no names.
    expect(showsLabels(3.4)).toBe(false);
  });

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
