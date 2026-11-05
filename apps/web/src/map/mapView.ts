// The store map's geometry, worked out without React: what part of the store to show, how
// to draw the route's legs, and when names fit (docs/plans/route-map.md). Metres throughout,
// origin top-left, y down (types.ts).
import type { Route } from '@pathfinder/core';
import type { MapAreas } from '../route/loadRoutingData';

type Point = readonly [number, number];

/** A rectangle of the store, in metres: what an SVG `viewBox` shows. */
export type ViewBox = { x: number; y: number; width: number; height: number };

/** The smallest box holding every point; a single point gives a box of size 0. */
export function boundsOf(points: readonly Point[]): ViewBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The whole store: every area's outline and every entrance. */
export function storeBounds(areas: MapAreas): ViewBox {
  return boundsOf([
    ...areas.areas.flatMap((area) => area.polygon),
    ...areas.entrances.map((entrance) => entrance.point),
  ]);
}

/**
 * The view that shows `target` with `padding` metres round it, widened to the screen's
 * `aspect` (width ÷ height) so nothing is stretched, centred on the target. Never smaller
 * than `minSize` metres across, so a leg of a few metres does not fill the screen.
 */
export function fitView(target: ViewBox, aspect: number, padding: number, minSize = 20): ViewBox {
  let width = Math.max(target.width + 2 * padding, minSize);
  let height = Math.max(target.height + 2 * padding, minSize);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return {
    x: target.x + target.width / 2 - width / 2,
    y: target.y + target.height / 2 - height / 2,
    width,
    height,
  };
}

/** Every leg of a route as points: one per stop, then the walk to the checkout. */
export function legsOf(route: Route): Point[][] {
  return [...route.stops.map((stop) => stop.leg), route.end.leg];
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

/** An SVG path through the points: "M x y L x y …". */
export function pathData(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

/** Names are hidden while a metre is fewer screen pixels than this: they would overlap. */
export const LABEL_MIN_PIXELS_PER_METRE = 7;

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
