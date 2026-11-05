// The store map's view, worked out without React: what part of the store to show at what
// size, how to draw the route's legs, and when names fit (docs/plans/route-map.md). Metres
// throughout, origin top-left, y down (types.ts). Plain geometry lives in core (§17).
import { boundsOf, fitView, type Route, type ViewBox } from '@pathfinder/core';

// The map's geometry from one place, for the map components.
export { boundsOf, fitView, pathData, type ViewBox } from '@pathfinder/core';

type Point = readonly [number, number];

/** Space kept round what the map fits on screen, in metres. */
export const PADDING_M = 4;

/** A map's size on screen, in CSS pixels. */
export type ScreenSize = { width: number; height: number };

/**
 * What a map of `size` shows to fit `focus`, and how many screen pixels a metre is: the
 * number that keeps nodes, numbers and names the same size on screen at any zoom. Null until
 * the map has been measured, or while it has no width or height.
 */
export function screenView(
  focus: ViewBox,
  size: ScreenSize | null,
  padding = PADDING_M,
): { view: ViewBox; pixelsPerMetre: number } | null {
  if (size === null || size.width <= 0 || size.height <= 0) return null;
  const view = fitView(focus, size.width / size.height, padding);
  return { view, pixelsPerMetre: size.width / view.width };
}

/** Every leg of a route as points: one per stop, then the walk to the checkout. */
export function legsOf(route: Route): Point[][] {
  return [...route.stops.map((stop) => stop.leg), route.end.leg];
}

const focusCache = new WeakMap<Route, ViewBox>();

/**
 * The box holding a whole route, what the overview fits on screen. The same object for the
 * same route, so a memoised map is not redrawn when nothing changed.
 */
export function routeFocus(route: Route): ViewBox {
  let focus = focusCache.get(route);
  if (focus === undefined) {
    focus = boundsOf(legsOf(route).flat());
    focusCache.set(route, focus);
  }
  return focus;
}

/**
 * How each leg is drawn while shopping. `current` is how many stops are done: the leg to
 * stop `current` (or to the checkout, once every stop is done) is `next`, the ones before
 * it `walked`, the ones after it `ahead`.
 */
export type LegState = 'walked' | 'next' | 'ahead';

export function legStates(legCount: number, current: number): LegState[] {
  return Array.from({ length: legCount }, (_, i) =>
    i < current ? 'walked' : i === current ? 'next' : 'ahead',
  );
}

const DRAW_RANK: Record<LegState, number> = { ahead: 0, walked: 1, next: 2 };

/**
 * The legs' indexes in the order to draw them: ahead first, then walked, then next, so the
 * next leg is never hidden under another. Legs of one state keep their route order.
 */
export function drawOrder(states: readonly LegState[]): number[] {
  return states
    .map((state, index) => ({ state, index }))
    .sort((a, b) => DRAW_RANK[a.state] - DRAW_RANK[b.state] || a.index - b.index)
    .map(({ index }) => index);
}

/**
 * Names are hidden while a metre is fewer screen pixels than this. A rough line: on the real
 * map a few neighbouring names still touch just above it (docs/plans/route-map.md §6).
 */
export const LABEL_MIN_PIXELS_PER_METRE = 7;

export function showsLabels(pixelsPerMetre: number): boolean {
  return pixelsPerMetre >= LABEL_MIN_PIXELS_PER_METRE;
}

/** A long map label cut to its first part: "Lihat, broilerit, kananmunat" → "Lihat…". */
export function shortLabel(label: string, maxLength = 18): string {
  if (label.length <= maxLength) return label;
  const first = label.split(/,| &/)[0]!.trim();
  return first.length <= maxLength ? `${first}…` : `${first.slice(0, maxLength - 1)}…`;
}

/** Where an area's name goes: the middle of its outline's box. */
export function labelPoint(polygon: readonly Point[]): Point {
  const box = boundsOf(polygon);
  return [box.x + box.width / 2, box.y + box.height / 2];
}
