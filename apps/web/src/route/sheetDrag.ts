// Dragging the shopping sheet up and down, worked out without React or the DOM
// (docs/plans/route-map.md §5). Offsets are CSS pixels the sheet is pushed down: 0 is open,
// `travel` is closed.

/**
 * How far down the closed sheet is pushed, as a part of its height: shopping.css makes it
 * 85svh tall and pushes it 55svh down when closed.
 */
export const CLOSED_SHIFT = 55 / 85;

/** A drag shorter than this, in pixels, is a tap: it opens or closes the sheet instead. */
export const TAP_SLOP = 6;

/** A flick faster than this, in pixels per millisecond, settles the way it went. */
export const FLICK_SPEED = 0.5;

/** Where the sheet sits during a drag that has moved `dy` pixels (down is positive). */
export function dragOffset(startedOpen: boolean, dy: number, travel: number): number {
  const offset = (startedOpen ? 0 : travel) + dy;
  return Math.min(Math.max(offset, 0), travel);
}

/**
 * Whether the sheet ends open after a drag: a flick decides by its direction; otherwise
 * whichever end it is nearer.
 */
export function settlesOpen(
  startedOpen: boolean,
  dy: number,
  travel: number,
  speed: number,
): boolean {
  if (Math.abs(speed) >= FLICK_SPEED) return speed < 0;
  return dragOffset(startedOpen, dy, travel) < travel / 2;
}
