// Pinch, pan, twist, wheel zoom and the glide to the next leg, worked out without React or the
// DOM (docs/plans/route-map.md §4). A view is the rectangle of the store, in metres, that the
// map shows, turned by its angle around its centre (`MapView`); screen points are CSS pixels
// from the map's top-left corner.
import {
  normalAngle,
  RADIANS_PER_DEGREE,
  type MapView,
  type ScreenSize,
  type ViewBox,
} from './mapView';

export type ScreenPoint = { x: number; y: number };

/** The closest the map zooms in: this many metres across. */
export const MIN_VIEW_WIDTH = 12;
/** The furthest it zooms out: the store's width times this. */
export const MAX_ZOOM_OUT = 1.5;
/** How far two fingers twist, in degrees, before the map starts turning with them: less is
 *  taken for a pinch that wasn't quite straight. */
export const TWIST_START = 10;

/** A store offset as it lies on screen once the map is turned `degrees` clockwise. */
function turned(offset: ScreenPoint, degrees: number): ScreenPoint {
  const cos = Math.cos(degrees * RADIANS_PER_DEGREE);
  const sin = Math.sin(degrees * RADIANS_PER_DEGREE);
  return { x: offset.x * cos - offset.y * sin, y: offset.x * sin + offset.y * cos };
}

const centreOf = (view: ViewBox): ScreenPoint => ({
  x: view.x + view.width / 2,
  y: view.y + view.height / 2,
});

/** How far a screen point is from the map's centre, in metres along the screen's axes, for a
 *  view `width` × `height` metres. */
function fromCentre(width: number, height: number, size: ScreenSize, point: ScreenPoint) {
  return {
    x: ((point.x - size.width / 2) * width) / size.width,
    y: ((point.y - size.height / 2) * height) / size.height,
  };
}

/** The store point under a screen point. */
export function toStore(view: MapView, size: ScreenSize, point: ScreenPoint): ScreenPoint {
  const centre = centreOf(view);
  const offset = turned(fromCentre(view.width, view.height, size, point), -(view.angle ?? 0));
  return { x: centre.x + offset.x, y: centre.y + offset.y };
}

/**
 * A view `width` × `height` metres turned `angle` degrees, placed so the store point `anchor`
 * is under the screen point `point`. Every gesture is this, with its own anchor and sizes.
 */
function placeView(
  anchor: ScreenPoint,
  point: ScreenPoint,
  size: ScreenSize,
  width: number,
  height: number,
  angle: number,
): MapView {
  const offset = turned(fromCentre(width, height, size, point), -angle);
  return {
    x: anchor.x - offset.x - width / 2,
    y: anchor.y - offset.y - height / 2,
    width,
    height,
    angle: normalAngle(angle),
  };
}

/** The view moved so the store follows a finger that moved `dx`, `dy` screen pixels. */
export function panBy(view: MapView, size: ScreenSize, dx: number, dy: number): MapView {
  const corner = { x: 0, y: 0 };
  return placeView(
    toStore(view, size, corner),
    { x: dx, y: dy },
    size,
    view.width,
    view.height,
    view.angle ?? 0,
  );
}

/**
 * The view zoomed in by `factor` (above 1 in, below 1 out), keeping the store point under
 * `point` where it is: zooming happens around the fingers or the mouse.
 */
export function zoomAround(
  view: MapView,
  size: ScreenSize,
  point: ScreenPoint,
  factor: number,
): MapView {
  return placeView(
    toStore(view, size, point),
    point,
    size,
    view.width / factor,
    view.height / factor,
    view.angle ?? 0,
  );
}

/**
 * The view turned `degrees` clockwise, keeping the store point under `point` where it is:
 * Shift and the mouse wheel turn the map around the mouse.
 */
export function turnAround(
  view: MapView,
  size: ScreenSize,
  point: ScreenPoint,
  degrees: number,
): MapView {
  return placeView(
    toStore(view, size, point),
    point,
    size,
    view.width,
    view.height,
    (view.angle ?? 0) + degrees,
  );
}

const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const middle = (a: ScreenPoint, b: ScreenPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const direction = (a: ScreenPoint, b: ScreenPoint) =>
  Math.atan2(b.y - a.y, b.x - a.x) / RADIANS_PER_DEGREE;

/** How far two fingers that moved from `from` to `to` have twisted, clockwise in degrees. */
export function twistOf(
  from: readonly [ScreenPoint, ScreenPoint],
  to: readonly [ScreenPoint, ScreenPoint],
): number {
  return normalAngle(direction(...to) - direction(...from));
}

/**
 * Two fingers that moved from `from` to `to`, starting at `start`: zoomed by how far apart
 * they moved, moved with their midpoint, and, once `turning`, turned as far as they twisted,
 * so the store point between them at the start stays between them. Whether the twist has
 * passed TWIST_START yet is for the caller to keep track of.
 */
export function pinchView(
  start: MapView,
  size: ScreenSize,
  from: readonly [ScreenPoint, ScreenPoint],
  to: readonly [ScreenPoint, ScreenPoint],
  turning = false,
): MapView {
  const factor = distance(...to) / Math.max(distance(...from), 1);
  // Fingers that started on one point have no direction to twist from.
  const twist = turning && distance(...from) >= 1 ? twistOf(from, to) : 0;
  return placeView(
    toStore(start, size, middle(...from)),
    middle(...to),
    size,
    start.width / factor,
    start.height / factor,
    (start.angle ?? 0) + twist,
  );
}

/**
 * The view kept usable: no closer than MIN_VIEW_WIDTH, no further out than MAX_ZOOM_OUT
 * times the store (both around the view's centre, keeping its shape), and its centre inside
 * the store, so the store can't be pushed off screen. The angle is left as it is.
 */
export function clampView(view: MapView, store: ViewBox): MapView {
  const maxWidth = Math.max(store.width, store.height) * MAX_ZOOM_OUT;
  const scale = Math.min(Math.max(view.width, MIN_VIEW_WIDTH), maxWidth) / view.width;
  const width = view.width * scale;
  const height = view.height * scale;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const centre = centreOf(view);
  const centreX = clamp(centre.x, store.x, store.x + store.width);
  const centreY = clamp(centre.y, store.y, store.y + store.height);
  return { ...view, x: centreX - width / 2, y: centreY - height / 2, width, height };
}

/**
 * The view a fraction `t` (0 to 1) of the way from `a` to `b`, eased out: for the glide. It
 * turns the short way round, so 170° to -170° is 20°, not 340°.
 */
export function glideView(a: MapView, b: MapView, t: number): MapView {
  const eased = 1 - (1 - t) ** 3;
  const mix = (from: number, to: number) => from + (to - from) * eased;
  const fromAngle = a.angle ?? 0;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    width: mix(a.width, b.width),
    height: mix(a.height, b.height),
    angle: normalAngle(mix(fromAngle, fromAngle + normalAngle((b.angle ?? 0) - fromAngle))),
  };
}

/** A view as an SVG `viewBox` attribute. */
export function viewBoxAttribute(view: ViewBox): string {
  return `${view.x} ${view.y} ${view.width} ${view.height}`;
}

/** A view's turn as an SVG `transform` for the store drawn inside its `viewBox`: around the
 *  view's centre, so the store point there stays there. */
export function turnAttribute(view: MapView): string {
  const centre = centreOf(view);
  return `rotate(${view.angle ?? 0} ${centre.x} ${centre.y})`;
}
