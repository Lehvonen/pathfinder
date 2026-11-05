// Pinch, pan, wheel zoom and the glide to the next leg, worked out without React or the DOM
// (docs/plans/route-map.md §5). A view is the rectangle of the store, in metres, that the
// map shows; screen points are CSS pixels from the map's top-left corner.
import type { ScreenSize, ViewBox } from './mapView';

export type ScreenPoint = { x: number; y: number };

/** The closest the map zooms in: this many metres across. */
export const MIN_VIEW_WIDTH = 12;
/** The furthest it zooms out: the store's width times this. */
export const MAX_ZOOM_OUT = 1.5;

/** The store point under a screen point. */
export function toStore(view: ViewBox, size: ScreenSize, point: ScreenPoint): ScreenPoint {
  return {
    x: view.x + (point.x * view.width) / size.width,
    y: view.y + (point.y * view.height) / size.height,
  };
}

/** The view moved so the store follows a finger that moved `dx`, `dy` screen pixels. */
export function panBy(view: ViewBox, size: ScreenSize, dx: number, dy: number): ViewBox {
  return {
    ...view,
    x: view.x - (dx * view.width) / size.width,
    y: view.y - (dy * view.height) / size.height,
  };
}

/**
 * The view zoomed in by `factor` (above 1 in, below 1 out), keeping the store point under
 * `point` where it is: zooming happens around the fingers or the mouse.
 */
export function zoomAround(
  view: ViewBox,
  size: ScreenSize,
  point: ScreenPoint,
  factor: number,
): ViewBox {
  const anchor = toStore(view, size, point);
  const width = view.width / factor;
  const height = view.height / factor;
  return {
    x: anchor.x - (point.x * width) / size.width,
    y: anchor.y - (point.y * height) / size.height,
    width,
    height,
  };
}

const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const middle = (a: ScreenPoint, b: ScreenPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Two fingers that moved from `from` to `to`, starting at `start`: zoomed by how far apart
 * they moved, and moved with their midpoint, so the store point between them at the start
 * stays between them.
 */
export function pinchView(
  start: ViewBox,
  size: ScreenSize,
  from: readonly [ScreenPoint, ScreenPoint],
  to: readonly [ScreenPoint, ScreenPoint],
): ViewBox {
  const factor = distance(...to) / Math.max(distance(...from), 1);
  const anchor = toStore(start, size, middle(...from));
  const now = middle(...to);
  const width = start.width / factor;
  const height = start.height / factor;
  return {
    x: anchor.x - (now.x * width) / size.width,
    y: anchor.y - (now.y * height) / size.height,
    width,
    height,
  };
}

/**
 * The view kept usable: no closer than MIN_VIEW_WIDTH, no further out than MAX_ZOOM_OUT
 * times the store (both around the view's centre, keeping its shape), and its centre inside
 * the store, so the store can't be pushed off screen.
 */
export function clampView(view: ViewBox, store: ViewBox): ViewBox {
  const maxWidth = Math.max(store.width, store.height) * MAX_ZOOM_OUT;
  const scale = Math.min(Math.max(view.width, MIN_VIEW_WIDTH), maxWidth) / view.width;
  const width = view.width * scale;
  const height = view.height * scale;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const centreX = clamp(view.x + view.width / 2, store.x, store.x + store.width);
  const centreY = clamp(view.y + view.height / 2, store.y, store.y + store.height);
  return { x: centreX - width / 2, y: centreY - height / 2, width, height };
}

/** The view a fraction `t` (0 to 1) of the way from `a` to `b`, eased out: for the glide. */
export function glideView(a: ViewBox, b: ViewBox, t: number): ViewBox {
  const eased = 1 - (1 - t) ** 3;
  const mix = (from: number, to: number) => from + (to - from) * eased;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    width: mix(a.width, b.width),
    height: mix(a.height, b.height),
  };
}

/** A view as an SVG `viewBox` attribute. */
export function viewBoxAttribute(view: ViewBox): string {
  return `${view.x} ${view.y} ${view.width} ${view.height}`;
}
