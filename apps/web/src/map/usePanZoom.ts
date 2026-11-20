import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { MapView, ScreenSize, ViewBox } from './mapView';
import {
  clampView,
  panBy,
  pinchStep,
  turnAround,
  wheelTurn,
  zoomAround,
  type ScreenPoint,
} from './panZoom';

/** The view, size and store as React last drew them: where a gesture starts if nothing else
 *  is on screen (see `showing`), and the limits it keeps to. */
export type PanZoomState = { view: MapView; size: ScreenSize; store: ViewBox };

type PanZoomOptions = {
  /** The element the gestures are on: the map's box. */
  target: RefObject<HTMLElement | null>;
  /** The view and sizes as drawn, or null before the map is measured. */
  state: PanZoomState | null;
  /** The view on screen right now, if it isn't `state.view`: part way through a glide. A
   *  gesture starts from it, so grabbing a gliding map doesn't make it jump. */
  showing(): MapView | null;
  /** A frame of a gesture: show this view. At most once per screen refresh. */
  onFrame(view: MapView): void;
  /** The gesture ended on this view. Not called for a tap that moved nothing. */
  onEnd(view: MapView): void;
};

/** A wheel zoom or turn counts as ended once the wheel has been still this long. */
const WHEEL_END_MS = 150;
/** How fast the wheel zooms: a factor per pixel scrolled. */
const WHEEL_ZOOM = 0.002;

/**
 * Pinch, pan, twist and wheel zoom on `target`, and Shift with the wheel to turn
 * (docs/plans/route-map.md §4). A twist turns the map only once it passes TWIST_START
 * (`pinchStep`). Gestures never re-render React: each frame goes to `onFrame`, which changes
 * the view directly, once per screen refresh. Only `onEnd` reaches React, once per gesture, so
 * sizes on screen can be worked out again for the new zoom. The maths, and when a twist starts
 * turning, is in `panZoom.ts`, which is tested; this hook only listens to the pointers.
 */
export function usePanZoom({ target, state, showing, onFrame, onEnd }: PanZoomOptions): void {
  const latest = useRef({ state, showing, onFrame, onEnd });
  useLayoutEffect(() => {
    latest.current = { state, showing, onFrame, onEnd };
  });

  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const pointers = new Map<number, ScreenPoint>();
    let start: { view: MapView; points: ScreenPoint[] } | null = null;
    /** The view the gesture shows now; null between gestures. */
    let shown: MapView | null = null;
    /** Whether this pinch has twisted past TWIST_START, and so turns the map. */
    let turning = false;
    let frame = 0;
    let wheelTimer = 0;

    const local = (event: MouseEvent): ScreenPoint => {
      const box = element.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const show = (view: MapView, store: ViewBox) => {
      shown = clampView(view, store);
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (shown !== null) latest.current.onFrame(shown);
        });
      }
    };
    const end = () => {
      // A frame still waiting would be lost with `shown`: draw it first, so the view on screen
      // is the one the gesture ends on, and React has nothing to glide to.
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        if (shown !== null) latest.current.onFrame(shown);
      }
      if (shown !== null) latest.current.onEnd(shown);
      shown = null;
    };
    /** The view on screen now: this gesture's, else a glide's, else the one React drew. */
    const onScreen = (now: PanZoomState) => shown ?? latest.current.showing() ?? now.view;
    /** Starts over from the view as it is now, with the fingers now down. */
    const restart = () => {
      const now = latest.current.state;
      start =
        now !== null && pointers.size > 0
          ? { view: onScreen(now), points: [...pointers.values()] }
          : null;
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // A button over the map (the north button) keeps its own taps: capturing the pointer here
      // would take its click away. Only one inside the map: a map inside a button still pans.
      const control = event.target instanceof Element ? event.target.closest('button') : null;
      if (control !== null && element.contains(control)) return;
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event));
      // Turning holds while two or more fingers stay down: a new pair starts unturned, but a
      // third finger going down, or one of three lifting, doesn't stop a turning pinch.
      if (pointers.size <= 2) turning = false;
      restart();
    };
    const move = (event: PointerEvent) => {
      const now = latest.current.state;
      if (!pointers.has(event.pointerId) || start === null || now === null) return;
      pointers.set(event.pointerId, local(event));
      const [a, b] = [...pointers.values()];
      const [startA, startB] = start.points;
      if (b === undefined && startB === undefined) {
        show(panBy(start.view, now.size, a!.x - startA!.x, a!.y - startA!.y), now.store);
      } else if (b !== undefined && startB !== undefined) {
        const step = pinchStep(start.view, now.size, [startA!, startB], [a!, b], turning);
        show(step.view, now.store);
        turning = step.turning;
        if (step.restart) restart();
      }
    };
    const up = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size < 2) turning = false;
      if (pointers.size === 0) {
        start = null;
        end();
      } else {
        restart();
      }
    };
    const wheel = (event: WheelEvent) => {
      const now = latest.current.state;
      if (now === null) return;
      event.preventDefault();
      const from = onScreen(now);
      if (event.shiftKey) {
        const degrees = wheelTurn(event.deltaX, event.deltaY);
        show(turnAround(from, now.size, local(event), degrees), now.store);
      } else {
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM);
        show(zoomAround(from, now.size, local(event), factor), now.store);
      }
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(end, WHEEL_END_MS);
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frame);
      window.clearTimeout(wheelTimer);
    };
  }, [target]);
}
