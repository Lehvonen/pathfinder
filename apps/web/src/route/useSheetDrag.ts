import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { CLOSED_SHIFT, dragOffset, settlesOpen, TAP_SLOP } from './sheetDrag';

type SheetDragOptions = {
  /** The sheet that moves. */
  sheet: RefObject<HTMLElement | null>;
  /** What the finger drags it by: its heading. */
  handle: RefObject<HTMLElement | null>;
  open: boolean;
  setOpen(open: boolean): void;
};

/** How long the sheet takes to settle, as in shopping.css's transition. */
const SETTLE_MS = 200;

/**
 * Drags the shopping sheet up and down by its heading (docs/plans/route-map.md §5). While the
 * finger moves, the sheet follows it directly, with no React render; on release it settles
 * open or closed (`settlesOpen`) and only then does React hear of it. A movement shorter than
 * a tap leaves the heading's own click to open or close it.
 *
 * Returns `wasDrag()`, for that click: true just after a drag, so the drag doesn't also
 * count as a tap.
 */
export function useSheetDrag({ sheet, handle, open, setOpen }: SheetDragOptions): () => boolean {
  const latest = useRef({ open, setOpen });
  useLayoutEffect(() => {
    latest.current = { open, setOpen };
  });
  const dragged = useRef(false);

  useEffect(() => {
    const element = sheet.current;
    const grip = handle.current;
    if (element === null || grip === null) return;
    let drag: {
      id: number;
      startY: number;
      startedOpen: boolean;
      travel: number;
      moving: boolean;
      lastY: number;
      lastTime: number;
      speed: number;
    } | null = null;
    let settleTimer = 0;

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      grip.setPointerCapture(event.pointerId);
      dragged.current = false;
      drag = {
        id: event.pointerId,
        startY: event.clientY,
        startedOpen: latest.current.open,
        travel: element.offsetHeight * CLOSED_SHIFT,
        moving: false,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        speed: 0,
      };
    };
    const move = (event: PointerEvent) => {
      if (drag === null || event.pointerId !== drag.id) return;
      const dy = event.clientY - drag.startY;
      if (!drag.moving && Math.abs(dy) < TAP_SLOP) return;
      drag.moving = true;
      drag.speed = (event.clientY - drag.lastY) / Math.max(event.timeStamp - drag.lastTime, 1);
      drag.lastY = event.clientY;
      drag.lastTime = event.timeStamp;
      window.clearTimeout(settleTimer);
      element.style.transition = 'none';
      element.style.transform = `translateY(${dragOffset(drag.startedOpen, dy, drag.travel)}px)`;
    };
    const up = (event: PointerEvent) => {
      if (drag === null || event.pointerId !== drag.id) return;
      const ended = drag;
      drag = null;
      if (!ended.moving) return;
      dragged.current = true;
      const nowOpen = settlesOpen(
        ended.startedOpen,
        event.clientY - ended.startY,
        ended.travel,
        ended.speed,
      );
      // Settle from where the finger let go to the end it chose, then hand back to the CSS.
      element.style.transition = '';
      element.style.transform = nowOpen ? 'none' : `translateY(${ended.travel}px)`;
      latest.current.setOpen(nowOpen);
      settleTimer = window.setTimeout(() => {
        element.style.transform = '';
      }, SETTLE_MS);
    };

    grip.addEventListener('pointerdown', down);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    return () => {
      grip.removeEventListener('pointerdown', down);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      window.clearTimeout(settleTimer);
    };
  }, [sheet, handle]);

  return useCallback(() => dragged.current, []);
}
