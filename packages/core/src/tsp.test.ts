import { describe, expect, it } from 'vitest';
import {
  bestOrder,
  HELD_KARP_MAX_STOPS,
  heldKarp,
  nearestNeighbourTwoOpt,
  tourLength,
  type TourCosts,
} from './tsp';

type Point = [number, number];
const distance = ([x1, y1]: Point, [x2, y2]: Point) => Math.hypot(x2 - x1, y2 - y1);

/** Straight-line costs: start at `start`, stops at `stops`, checkouts at `ends`. */
function costsFor(start: Point, stops: Point[], ends: Point[]): TourCosts {
  return {
    fromStart: stops.map((stop) => distance(start, stop)),
    between: stops.map((a) => stops.map((b) => distance(a, b))),
    toEnd: stops.map((stop) => Math.min(...ends.map((end) => distance(stop, end)))),
  };
}

/** A repeatable list of `count` random points in a 100 × 100 store. */
function randomPoints(count: number, seed: number): Point[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return (state / 2 ** 31) * 100;
  };
  return Array.from({ length: count }, () => [next(), next()]);
}

/** The shortest length by trying every order: the answer to check the others against. */
function bruteForceLength(costs: TourCosts): number {
  const permutations = (items: number[]): number[][] =>
    items.length <= 1
      ? [items]
      : items.flatMap((item, i) =>
          permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
            item,
            ...rest,
          ]),
        );
  const stops = costs.fromStart.map((_, i) => i);
  return Math.min(...permutations(stops).map((order) => tourLength(costs, order)));
}

const isOrderOf = (order: number[], count: number) =>
  [...order].sort((a, b) => a - b).join() === Array.from({ length: count }, (_, i) => i).join();

describe('tourLength', () => {
  it('adds start → stops → end', () => {
    const costs = costsFor(
      [0, 0],
      [
        [3, 0],
        [3, 4],
      ],
      [[3, 10]],
    );
    expect(tourLength(costs, [0, 1])).toBe(3 + 4 + 6);
  });

  it('is 0 for no stops', () => {
    expect(tourLength(costsFor([0, 0], [], [[1, 1]]), [])).toBe(0);
  });
});

describe('heldKarp', () => {
  it('gives no order for no stops, and the one stop for one', () => {
    expect(heldKarp(costsFor([0, 0], [], [[1, 1]]))).toEqual([]);
    expect(heldKarp(costsFor([0, 0], [[5, 5]], [[1, 1]]))).toEqual([0]);
  });

  it('beats going to the nearest stop first, when that is wrong', () => {
    // Nearest first goes right to 0, then must cross back over the start to 1 and 2.
    const costs = costsFor(
      [0, 0],
      [
        [1, 0],
        [-2, 0],
        [-4, 0],
      ],
      [[3, 0]],
    );
    expect(heldKarp(costs)).toEqual([2, 1, 0]);
  });

  it('picks the last stop by the checkout nearest to it', () => {
    // Two stops, two checkouts: end at whichever checkout the order passes last.
    const costs = costsFor(
      [0, 0],
      [
        [0, 10],
        [10, 0],
      ],
      [
        [0, 12],
        [50, 50],
      ],
    );
    expect(heldKarp(costs)).toEqual([1, 0]);
  });

  it('matches trying every order, on 30 random lists of up to 7 stops', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const points = randomPoints(2 + (seed % 6), seed);
      const costs = costsFor([0, 50], points, [
        [100, 40],
        [100, 60],
      ]);
      const order = heldKarp(costs);
      expect(isOrderOf(order, points.length)).toBe(true);
      expect(tourLength(costs, order)).toBeCloseTo(bruteForceLength(costs), 9);
    }
  });

  it('refuses more stops than it can do in time', () => {
    const points = randomPoints(HELD_KARP_MAX_STOPS + 1, 7);
    expect(() => heldKarp(costsFor([0, 0], points, [[1, 1]]))).toThrow('at most 15');
  });
});

describe('nearestNeighbourTwoOpt', () => {
  it('visits every stop once', () => {
    const points = randomPoints(40, 3);
    expect(isOrderOf(nearestNeighbourTwoOpt(costsFor([0, 50], points, [[100, 50]])), 40)).toBe(
      true,
    );
  });

  it('is never shorter than Held-Karp, and close to it, on 20 random lists', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const points = randomPoints(8 + (seed % 5), seed);
      const costs = costsFor([0, 50], points, [
        [100, 40],
        [100, 60],
      ]);
      const exact = tourLength(costs, heldKarp(costs));
      const heuristic = tourLength(costs, nearestNeighbourTwoOpt(costs));
      expect(heuristic).toBeGreaterThanOrEqual(exact - 1e-9);
      expect(heuristic).toBeLessThanOrEqual(exact * 1.15);
    }
  });

  it('undoes a crossing that nearest-neighbour makes', () => {
    const costs = costsFor(
      [0, 0],
      [
        [1, 0],
        [-2, 0],
        [-4, 0],
      ],
      [[3, 0]],
    );
    expect(nearestNeighbourTwoOpt(costs)).toEqual([2, 1, 0]);
  });
});

describe('bestOrder', () => {
  it('is exact up to the Held-Karp limit', () => {
    const points = randomPoints(HELD_KARP_MAX_STOPS, 11);
    const costs = costsFor([0, 50], points, [[100, 50]]);
    expect(bestOrder(costs)).toEqual(heldKarp(costs));
  });

  it('still gives a full order above it', () => {
    const points = randomPoints(HELD_KARP_MAX_STOPS + 5, 11);
    const costs = costsFor([0, 50], points, [[100, 50]]);
    expect(bestOrder(costs)).toEqual(nearestNeighbourTwoOpt(costs));
    expect(isOrderOf(bestOrder(costs), HELD_KARP_MAX_STOPS + 5)).toBe(true);
  });
});
