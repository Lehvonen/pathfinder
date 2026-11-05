// Where the shopper is on the route, worked out from the ticks without React
// (docs/plans/route-map.md §5). The route is the one planned when "Aloita ostokset" was
// pressed; the ticks are the list's `checked` items, so ticking and unticking move along it.
import { boundsOf, type Route, type ViewBox } from '@pathfinder/core';
import { legsOf } from '../map/mapView';

/**
 * How many stops are done: the route moves on only once every item at a stop is ticked, so
 * this is the first stop with an item still to pick. Unticking an item at an earlier stop
 * steps back to it. Every stop done gives the number of stops: the walk to the checkout is
 * next.
 */
export function stopsDone(route: Route, ticked: ReadonlySet<string>): number {
  const index = route.stops.findIndex((stop) => stop.items.some((item) => !ticked.has(item.id)));
  return index === -1 ? route.stops.length : index;
}

/** Metres still to walk: the next leg and every leg after it, the checkout's included. */
export function distanceLeft(route: Route, done: number): number {
  return route.stops
    .slice(done)
    .reduce((sum, stop) => sum + stop.legDistance, route.end.legDistance);
}

const legFocusCache = new WeakMap<Route, ViewBox[]>();

/**
 * What the shopping map fits on screen: the leg to the next stop, or to the checkout once
 * every stop is done. The same object for the same route and leg, so the memoised map is
 * not redrawn when a tick does not move the route on.
 */
export function legFocus(route: Route, done: number): ViewBox {
  let boxes = legFocusCache.get(route);
  if (boxes === undefined) {
    boxes = legsOf(route).map((leg) => boundsOf(leg));
    legFocusCache.set(route, boxes);
  }
  return boxes[Math.min(done, boxes.length - 1)]!;
}

/** The shop's length, from "Aloita ostokset" to the end: "11 min", or "alle 1 min" under half a
 * minute. */
export function formatElapsed(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  return minutes < 1 ? 'alle 1 min' : `${minutes} min`;
}
