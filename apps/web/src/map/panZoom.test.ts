import { describe, expect, it } from 'vitest';
import {
  clampView,
  glideView,
  MAX_ZOOM_OUT,
  MIN_VIEW_WIDTH,
  panBy,
  pinchView,
  toStore,
  viewBoxAttribute,
  zoomAround,
} from './panZoom';

// 100 × 50 m shown on a 400 × 200 px map: 4 px per metre.
const view = { x: 0, y: 0, width: 100, height: 50 };
const size = { width: 400, height: 200 };
const store = { x: 0, y: 0, width: 100, height: 120 };

describe('toStore', () => {
  it('turns a screen point into the store point under it', () => {
    expect(toStore(view, size, { x: 200, y: 100 })).toEqual({ x: 50, y: 25 });
    expect(toStore({ ...view, x: 10 }, size, { x: 0, y: 0 })).toEqual({ x: 10, y: 0 });
  });
});

describe('panBy', () => {
  it('moves the store with the finger: right by 40 px is 10 m the other way', () => {
    expect(panBy(view, size, 40, -20)).toEqual({ x: -10, y: 5, width: 100, height: 50 });
  });
});

describe('zoomAround', () => {
  it('zooms in by the factor, keeping the store point under the finger where it is', () => {
    const point = { x: 100, y: 50 };
    const zoomed = zoomAround(view, size, point, 2);
    expect(zoomed.width).toBe(50);
    expect(zoomed.height).toBe(25);
    expect(toStore(zoomed, size, point)).toEqual(toStore(view, size, point));
  });

  it('zooms out for a factor below 1', () => {
    expect(zoomAround(view, size, { x: 0, y: 0 }, 0.5).width).toBe(200);
  });
});

describe('pinchView', () => {
  it('zooms in as the fingers move apart, around the point between them', () => {
    const from = [
      { x: 150, y: 100 },
      { x: 250, y: 100 },
    ] as const;
    const to = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ] as const;
    const pinched = pinchView(view, size, from, to);
    expect(pinched.width).toBe(50);
    expect(toStore(pinched, size, { x: 200, y: 100 })).toEqual({ x: 50, y: 25 });
  });

  it('pans with two fingers moving together', () => {
    const from = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ] as const;
    const to = [
      { x: 140, y: 100 },
      { x: 240, y: 100 },
    ] as const;
    expect(pinchView(view, size, from, to)).toEqual({ x: -10, y: 0, width: 100, height: 50 });
  });

  it('does not divide by zero when both fingers start on one point', () => {
    const same = { x: 100, y: 100 };
    const pinched = pinchView(view, size, [same, same], [same, { x: 110, y: 100 }]);
    expect(Number.isFinite(pinched.width)).toBe(true);
  });
});

describe('clampView', () => {
  it('leaves a view inside the limits as it is', () => {
    expect(clampView(view, store)).toEqual(view);
  });

  it('zooms in no closer than the smallest width, around the centre, keeping the shape', () => {
    const clamped = clampView({ x: 45, y: 20, width: 4, height: 2 }, store);
    expect(clamped.width).toBe(MIN_VIEW_WIDTH);
    expect(clamped.height).toBe(MIN_VIEW_WIDTH / 2);
    expect(clamped.x + clamped.width / 2).toBe(47);
  });

  it('zooms out no further than the store times the limit', () => {
    const clamped = clampView({ x: 0, y: 0, width: 1000, height: 500 }, store);
    expect(clamped.width).toBe(120 * MAX_ZOOM_OUT);
  });

  it('keeps the centre of the view inside the store', () => {
    const clamped = clampView({ x: 500, y: -400, width: 20, height: 10 }, store);
    expect(clamped.x + clamped.width / 2).toBe(100);
    expect(clamped.y + clamped.height / 2).toBe(0);
  });
});

describe('glideView', () => {
  const to = { x: 50, y: 50, width: 20, height: 10 };

  it('starts at the old view and ends at the new one', () => {
    expect(glideView(view, to, 0)).toEqual(view);
    expect(glideView(view, to, 1)).toEqual(to);
  });

  it('eases out: more than half way at half time', () => {
    expect(glideView(view, to, 0.5).x).toBeGreaterThan(25);
  });
});

describe('viewBoxAttribute', () => {
  it('writes the view as SVG expects', () => {
    expect(viewBoxAttribute({ x: 1.5, y: -2, width: 30, height: 15 })).toBe('1.5 -2 30 15');
  });
});
