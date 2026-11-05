// The order to visit the stops in (ARCHITECTURE.md §9 step 3, docs/plans/routing.md §3).
// An open path: it starts at a fixed point, visits every stop once, and ends at whichever
// checkout is nearest the last stop, so the order and the checkout are chosen together.

/**
 * Walking distances for one list, indexed by stop. `fromStart[i]` is the start to stop i,
 * `between[i][j]` stop i to stop j, `toEnd[i]` stop i to its nearest checkout.
 */
export type TourCosts = {
  fromStart: readonly number[];
  between: readonly (readonly number[])[];
  toEnd: readonly number[];
};

/** Up to this many stops the exact order is found; above it, a near-shortest one. */
export const HELD_KARP_MAX_STOPS = 15;

/** Start → the stops in `order` → the end. 0 for no stops. */
export function tourLength(costs: TourCosts, order: readonly number[]): number {
  if (order.length === 0) return 0;
  let total = costs.fromStart[order[0]!]!;
  for (let i = 1; i < order.length; i++) total += costs.between[order[i - 1]!]![order[i]!]!;
  return total + costs.toEnd[order[order.length - 1]!]!;
}

/**
 * Held-Karp: the shortest order, exactly. `best[set][last]` is the shortest walk from the
 * start through the stops in `set` (a bitmask), ending at `last`. Time grows as 2ⁿ·n², so
 * this is for up to HELD_KARP_MAX_STOPS stops: 15 is about 7 million steps.
 */
export function heldKarp(costs: TourCosts): number[] {
  const n = costs.fromStart.length;
  if (n === 0) return [];
  if (n > HELD_KARP_MAX_STOPS) {
    throw new Error(`heldKarp: ${n} stops, at most ${HELD_KARP_MAX_STOPS}`);
  }
  const sets = 1 << n;
  const best = new Float64Array(sets * n).fill(Infinity);
  const before = new Int8Array(sets * n).fill(-1);
  for (let i = 0; i < n; i++) best[(1 << i) * n + i] = costs.fromStart[i]!;

  for (let set = 1; set < sets; set++) {
    for (let last = 0; last < n; last++) {
      const walked = best[set * n + last]!;
      if (walked === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (set & (1 << next)) continue;
        const cell = (set | (1 << next)) * n + next;
        const through = walked + costs.between[last]![next]!;
        if (through < best[cell]!) {
          best[cell] = through;
          before[cell] = last;
        }
      }
    }
  }

  const all = sets - 1;
  let last = 0;
  for (let i = 1; i < n; i++) {
    if (best[all * n + i]! + costs.toEnd[i]! < best[all * n + last]! + costs.toEnd[last]!) last = i;
  }
  const order: number[] = [];
  for (let set = all; last !== -1;) {
    order.push(last);
    const previous = before[set * n + last]!;
    set &= ~(1 << last);
    last = previous;
  }
  return order.reverse();
}

/**
 * Nearest-neighbour, then 2-opt: from the start always go to the nearest unvisited stop,
 * then keep reversing any stretch of the order that makes the whole walk shorter, until
 * none does. Usually within a few percent of the shortest; for lists too long for Held-Karp.
 */
export function nearestNeighbourTwoOpt(costs: TourCosts): number[] {
  const n = costs.fromStart.length;
  const order: number[] = [];
  const left = new Set(Array.from({ length: n }, (_, i) => i));
  let distanceTo = costs.fromStart;
  while (left.size > 0) {
    let nearest = -1;
    for (const stop of left) {
      if (nearest === -1 || distanceTo[stop]! < distanceTo[nearest]!) nearest = stop;
    }
    order.push(nearest);
    left.delete(nearest);
    distanceTo = costs.between[nearest]!;
  }

  let length = tourLength(costs, order);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const tried = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        const triedLength = tourLength(costs, tried);
        if (triedLength < length - 1e-9) {
          order.splice(0, n, ...tried);
          length = triedLength;
          improved = true;
        }
      }
    }
  }
  return order;
}

/** The order to visit the stops in: exact up to HELD_KARP_MAX_STOPS, near-shortest above. */
export function bestOrder(costs: TourCosts): number[] {
  return costs.fromStart.length <= HELD_KARP_MAX_STOPS
    ? heldKarp(costs)
    : nearestNeighbourTwoOpt(costs);
}
