import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { ScreenSize, ViewBox } from './mapView';
import { clampView, panBy, pinchView, zoomAround, type ScreenPoint } from './panZoom';

/** What a gesture starts from, as the map was last drawn. */
export type PanZoomState = { view: ViewBox; size: ScreenSize; store: ViewBox };

type PanZoomOptions = {
  /** The element the gestures are on: the map's box. */
  target: RefObject<HTMLElement | null>;
  /** The view and sizes as drawn, or null before the map is measured. */
  state: PanZoomState | null;
  /** A frame of a gesture: show this view. At most once per screen refresh. */
  onFrame(view: ViewBox): void;
  /** The gesture ended on this view. Not called for a tap that moved nothing. */
  onEnd(view: ViewBox): void;
};

/** A wheel zoom counts as ended once the wheel has been still this long. */
const WHEEL_END_MS = 150;
/** How fast the wheel zooms: a factor per pixel scrolled. */
const WHEEL_ZOOM = 0.002;

/**
 * Pinch, pan and wheel zoom on `target` (docs/plans/route-map.md §4). Gestures never
 * re-render React: each frame goes to `onFrame`, which changes the view directly, once per
 * screen refresh. Only `onEnd` reaches React, once per gesture, so sizes on screen can be
 * worked out again for the new zoom. The maths is in `panZoom.ts`, which is tested; this hook
 * only listens to the pointers.
 */
export function usePanZoom({ target, state, onFrame, onEnd }: PanZoomOptions): void {
  const latest = useRef({ state, onFrame, onEnd });
  useLayoutEffect(() => {
    latest.current = { state, onFrame, onEnd };
  });

  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const pointers = new Map<number, ScreenPoint>();
    let start: { view: ViewBox; points: ScreenPoint[] } | null = null;
    /** The view the gesture shows now; null between gestures. */
    let shown: ViewBox | null = null;
    let frame = 0;
    let wheelTimer = 0;

    const local = (event: MouseEvent): ScreenPoint => {
      const box = element.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const show = (view: ViewBox, store: ViewBox) => {
      shown = clampView(view, store);
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (shown !== null) latest.current.onFrame(shown);
        });
      }
    };
    const end = () => {
      if (shown !== null) latest.current.onEnd(shown);
      shown = null;
    };
    /** Starts over from the view as it is now, with the fingers now down. */
    const restart = () => {
      const now = latest.current.state;
      start =
        now !== null && pointers.size > 0
          ? { view: shown ?? now.view, points: [...pointers.values()] }
          : null;
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event));
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
        show(pinchView(start.view, now.size, [startA!, startB], [a!, b]), now.store);
      }
    };
    const up = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
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
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM);
      show(zoomAround(shown ?? now.view, now.size, local(event), factor), now.store);
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
