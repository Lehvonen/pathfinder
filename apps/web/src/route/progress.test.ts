import type { ListItem, Route } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import { distanceLeft, formatElapsed, legFocus, stopsDone } from './progress';

const item = (id: string, quantity = 1): ListItem => ({
  id,
  kind: 'product',
  ean: id,
  quantity,
  checked: false,
});

// in (0,0) → a (0,10): milk and bread → b (10,10): eggs → out (10,0)
const route: Route = {
  start: { nodeId: 'in', x: 0, y: 0 },
  stops: [
    {
      nodeId: 'a',
      x: 0,
      y: 10,
      leg: [
        [0, 0],
        [0, 10],
      ],
      legDistance: 10,
      order: 1,
      items: [item('milk', 2), item('bread')],
    },
    {
      nodeId: 'b',
      x: 10,
      y: 10,
      leg: [
        [0, 10],
        [10, 10],
      ],
      legDistance: 10,
      order: 2,
      items: [item('eggs')],
    },
  ],
  end: {
    nodeId: 'out',
    x: 10,
    y: 0,
    leg: [
      [10, 10],
      [10, 0],
    ],
    legDistance: 10,
  },
  totalDistance: 30,
  estimatedMinutes: 1,
};

describe('stopsDone', () => {
  it('is 0 before anything is ticked', () => {
    expect(stopsDone(route, new Set())).toBe(0);
  });

  it('moves on only once every item at the stop is ticked', () => {
    expect(stopsDone(route, new Set(['milk']))).toBe(0);
    expect(stopsDone(route, new Set(['milk', 'bread']))).toBe(1);
  });

  it('is the number of stops once everything is ticked: the checkout is next', () => {
    expect(stopsDone(route, new Set(['milk', 'bread', 'eggs']))).toBe(2);
  });

  it('steps back when an item at an earlier stop is unticked', () => {
    // Eggs ticked at stop 2, but bread at stop 1 unticked again: back to stop 1.
    expect(stopsDone(route, new Set(['milk', 'eggs']))).toBe(0);
  });

  it('ignores ticks on items that are not on the route', () => {
    expect(stopsDone(route, new Set(['coffee']))).toBe(0);
  });
});

describe('distanceLeft', () => {
  it('adds the next leg, the ones after it and the walk to the checkout', () => {
    expect(distanceLeft(route, 0)).toBe(30);
    expect(distanceLeft(route, 1)).toBe(20);
    expect(distanceLeft(route, 2)).toBe(10);
  });
});

describe('legFocus', () => {
  it('fits the leg to the next stop', () => {
    expect(legFocus(route, 0)).toEqual({ x: 0, y: 0, width: 0, height: 10 });
    expect(legFocus(route, 1)).toEqual({ x: 0, y: 10, width: 10, height: 0 });
  });

  it('fits the walk to the checkout once every stop is done, and stays there after', () => {
    expect(legFocus(route, 2)).toEqual({ x: 10, y: 0, width: 0, height: 10 });
    expect(legFocus(route, 5)).toBe(legFocus(route, 2));
  });

  it('gives the same object for the same route and leg, so the map is not redrawn', () => {
    expect(legFocus(route, 1)).toBe(legFocus(route, 1));
  });
});

describe('a route with no stops', () => {
  // Every unticked item unplaced: the route is only the walk from the entrance to a checkout.
  const empty: Route = { ...route, stops: [], totalDistance: 10 };

  it('is done at once, with the walk to the checkout next', () => {
    expect(stopsDone(empty, new Set())).toBe(0);
    expect(distanceLeft(empty, 0)).toBe(10);
    expect(legFocus(empty, 0)).toEqual({ x: 10, y: 0, width: 0, height: 10 });
  });
});

describe('formatElapsed', () => {
  it('gives whole minutes, and "alle 1 min" below half a minute', () => {
    expect(formatElapsed(11 * 60_000)).toBe('11 min');
    expect(formatElapsed(90_000)).toBe('2 min');
    expect(formatElapsed(20_000)).toBe('alle 1 min');
    expect(formatElapsed(29_999)).toBe('alle 1 min');
    expect(formatElapsed(30_000)).toBe('1 min');
  });
});
