import { describe, expect, it } from 'vitest';
import { RADIANS_PER_DEGREE } from './mapView';
import {
  clampView,
  glideView,
  MAX_ZOOM_OUT,
  MIN_VIEW_WIDTH,
  panBy,
  pinchStep,
  pinchView,
  toStore,
  turnAround,
  turnAttribute,
  TWIST_START,
  twistOf,
  viewBoxAttribute,
  WHEEL_TURN,
  wheelTurn,
  zoomAround,
  type ScreenPoint,
} from './panZoom';

// 100 × 50 m shown on a 400 × 200 px map: 4 px per metre.
const view = { x: 0, y: 0, width: 100, height: 50, angle: 0 };
// The same, turned a quarter clockwise: the store's top now points right.
const quarter = { ...view, angle: 90 };
const size = { width: 400, height: 200 };
const store = { x: 0, y: 0, width: 100, height: 120 };
const centre = { x: 200, y: 100 };
// Two fingers 100 px apart, either side of the centre.
const apart = [
  { x: 150, y: 100 },
  { x: 250, y: 100 },
] as const;

/** Turning works in sines and cosines, so turned points are compared to within rounding. */
function expectNear(actual: ScreenPoint, expected: ScreenPoint) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

describe('toStore', () => {
  it('turns a screen point into the store point under it', () => {
    expect(toStore(view, size, { x: 200, y: 100 })).toEqual({ x: 50, y: 25 });
    expect(toStore({ ...view, x: 10 }, size, { x: 0, y: 0 })).toEqual({ x: 10, y: 0 });
  });

  it('turns with the map: 10 m right of the centre is 10 m towards the top of the store', () => {
    expectNear(toStore(quarter, size, centre), { x: 50, y: 25 });
    expectNear(toStore(quarter, size, { x: 240, y: 100 }), { x: 50, y: 15 });
  });

  it('counts a view with no angle as north up', () => {
    const northUp = { x: 0, y: 0, width: 100, height: 50 };
    const point = { x: 40, y: 20 };
    expect(toStore(northUp, size, point)).toEqual(toStore(view, size, point));
  });
});

describe('panBy', () => {
  it('moves the store with the finger: right by 40 px is 10 m the other way', () => {
    expect(panBy(view, size, 40, -20)).toEqual({ ...view, x: -10, y: 5 });
  });

  it('moves a turned store with the finger too, keeping the angle', () => {
    const panned = panBy(quarter, size, 40, -20);
    expect(panned.angle).toBe(90);
    expect(panned.width).toBe(100);
    expectNear(toStore(panned, size, { x: 240, y: 80 }), toStore(quarter, size, centre));
  });
});

describe('zoomAround', () => {
  it('zooms in by the factor, keeping the store point under the finger where it is', () => {
    const point = { x: 100, y: 50 };
    const zoomed = zoomAround(view, size, point, 2);
    expect(zoomed.width).toBe(50);
    expect(zoomed.height).toBe(25);
    expectNear(toStore(zoomed, size, point), toStore(view, size, point));
  });

  it('keeps the point under the finger on a turned map too', () => {
    const point = { x: 100, y: 50 };
    const zoomed = zoomAround(quarter, size, point, 2);
    expect(zoomed.angle).toBe(90);
    expectNear(toStore(zoomed, size, point), toStore(quarter, size, point));
  });

  it('zooms out for a factor below 1', () => {
    expect(zoomAround(view, size, { x: 0, y: 0 }, 0.5).width).toBe(200);
  });
});

describe('turnAround', () => {
  const mouse = { x: 100, y: 50 };

  it('turns the map clockwise, keeping the store point under the mouse where it is', () => {
    const turned = turnAround(view, size, mouse, 30);
    expect(turned.angle).toBe(30);
    expect(turned.width).toBe(100);
    expectNear(toStore(turned, size, mouse), toStore(view, size, mouse));
  });

  it('goes on past 180 the other side', () => {
    expect(turnAround({ ...view, angle: 170 }, size, mouse, 20).angle).toBeCloseTo(-170);
  });
});

describe('twistOf', () => {
  it('measures how far the line between two fingers turned, clockwise', () => {
    const across = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ] as const;
    const down = [
      { x: 150, y: 50 },
      { x: 150, y: 150 },
    ] as const;
    expect(twistOf(across, down)).toBeCloseTo(90);
    expect(twistOf(down, across)).toBeCloseTo(-90);
  });

  it('takes the short way round past straight left', () => {
    const from = [
      { x: 0, y: 0 },
      { x: -100, y: -10 },
    ] as const;
    const to = [
      { x: 0, y: 0 },
      { x: -100, y: 10 },
    ] as const;
    // Up-left to down-left on screen is anticlockwise: 2 × atan(0.1), about 11.42°, not 348.58°.
    expect(twistOf(from, to)).toBeCloseTo(-11.42, 1);
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
    expectNear(toStore(pinched, size, centre), { x: 50, y: 25 });
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
    expect(pinchView(view, size, from, to)).toEqual({ ...view, x: -10 });
  });

  describe('twisting', () => {
    // The fingers `apart`, turned a quarter clockwise around the centre.
    const from = apart;
    const to = [
      { x: 200, y: 50 },
      { x: 200, y: 150 },
    ] as const;

    it('leaves the angle alone until the caller says the map is turning', () => {
      expect(pinchView(view, size, from, to).angle).toBe(0);
    });

    it('turns the map with the fingers, around the point between them', () => {
      const pinched = pinchView(view, size, from, to, true);
      expect(pinched.angle).toBeCloseTo(90);
      expect(pinched.width).toBeCloseTo(100);
      expectNear(toStore(pinched, size, centre), toStore(view, size, centre));
    });

    it('keeps the store point under each finger, twisting and spreading off centre', () => {
      const start = { ...view, angle: 30 };
      const offFrom = [
        { x: 60, y: 40 },
        { x: 140, y: 100 },
      ] as const;
      const offTo = [
        { x: 90, y: 160 },
        { x: 260, y: 20 },
      ] as const;
      const pinched = pinchView(start, size, offFrom, offTo, true);
      expectNear(toStore(pinched, size, offTo[0]), toStore(start, size, offFrom[0]));
      expectNear(toStore(pinched, size, offTo[1]), toStore(start, size, offFrom[1]));
    });
  });

  it('does not turn when both fingers start on one point: they had no direction', () => {
    const same = { x: 100, y: 100 };
    expect(pinchView(view, size, [same, same], [same, { x: 100, y: 110 }], true).angle).toBe(0);
  });

  it('does not divide by zero when both fingers start on one point', () => {
    const same = { x: 100, y: 100 };
    const pinched = pinchView(view, size, [same, same], [same, { x: 110, y: 100 }]);
    expect(Number.isFinite(pinched.width)).toBe(true);
  });
});

describe('pinchStep', () => {
  // The fingers `apart`, twisted `degrees` clockwise around the centre.
  const from = apart;
  const twisted = (degrees: number) => {
    const cos = 50 * Math.cos(degrees * RADIANS_PER_DEGREE);
    const sin = 50 * Math.sin(degrees * RADIANS_PER_DEGREE);
    return [
      { x: 200 - cos, y: 100 - sin },
      { x: 200 + cos, y: 100 + sin },
    ] as const;
  };

  it('does not turn the map for a twist short of the start', () => {
    const step = pinchStep(view, size, from, twisted(TWIST_START - 0.1), false);
    expect(step.view.angle).toBe(0);
    expect(step.turning).toBe(false);
    expect(step.restart).toBe(false);
  });

  it('starts turning once the twist passes the start, drawing that frame unturned', () => {
    const step = pinchStep(view, size, from, twisted(TWIST_START + 0.1), false);
    expect(step.view.angle).toBe(0);
    expect(step.turning).toBe(true);
    expect(step.restart).toBe(true);
  });

  it('does not jump: past the start, the twist counts from where it crossed', () => {
    // Frames as the hook runs them: a restart starts over from that frame's view and fingers.
    const crossingFingers = twisted(TWIST_START + 0.1);
    const crossing = pinchStep(view, size, from, crossingFingers, false);
    const [start, fingers] = crossing.restart ? [crossing.view, crossingFingers] : [view, from];
    const next = pinchStep(start, size, fingers, twisted(TWIST_START + 0.6), crossing.turning);
    // Half a degree more than where it crossed, not the whole twist from the first touch.
    expect(next.view.angle).toBeCloseTo(0.5);
  });

  it('starts turning for an anticlockwise twist past the start too, not one short of it', () => {
    const past = pinchStep(view, size, from, twisted(-(TWIST_START + 0.1)), false);
    expect(past.turning).toBe(true);
    expect(past.restart).toBe(true);
    const short = pinchStep(view, size, from, twisted(-(TWIST_START - 0.1)), false);
    expect(short.turning).toBe(false);
  });

  it('turns with the fingers once turning, however little they twist', () => {
    const step = pinchStep(view, size, from, twisted(3), true);
    expect(step.view.angle).toBeCloseTo(3);
    expect(step.turning).toBe(true);
    expect(step.restart).toBe(false);
  });
});

describe('wheelTurn', () => {
  it('turns clockwise as the wheel scrolls down', () => {
    expect(wheelTurn(0, 100)).toBeCloseTo(100 * WHEEL_TURN);
    expect(wheelTurn(0, -100)).toBeCloseTo(-100 * WHEEL_TURN);
  });

  it('takes a sideways scroll when the browser sends Shift that way', () => {
    expect(wheelTurn(100, 0)).toBeCloseTo(100 * WHEEL_TURN);
  });

  it('goes by the up-and-down scroll when a scroll is both ways, as on a trackpad', () => {
    expect(wheelTurn(50, 100)).toBeCloseTo(100 * WHEEL_TURN);
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

  it('leaves the angle as it is', () => {
    expect(clampView({ ...quarter, width: 4, height: 2 }, store).angle).toBe(90);
  });

  it('keeps the centre of the view inside the store', () => {
    const clamped = clampView({ x: 500, y: -400, width: 20, height: 10 }, store);
    expect(clamped.x + clamped.width / 2).toBe(100);
    expect(clamped.y + clamped.height / 2).toBe(0);
  });
});

describe('glideView', () => {
  const to = { x: 50, y: 50, width: 20, height: 10, angle: 0 };

  it('starts at the old view and ends at the new one', () => {
    expect(glideView(view, to, 0)).toEqual(view);
    expect(glideView(view, to, 1)).toEqual(to);
  });

  it('eases out: more than half way at half time', () => {
    expect(glideView(view, to, 0.5).x).toBeGreaterThan(25);
  });

  it('turns the short way round: 170° to -170° passes 180, not 0', () => {
    const from = { ...view, angle: 170 };
    const back = { ...to, angle: -170 };
    expect(Math.abs(glideView(from, back, 0.5).angle ?? NaN)).toBeGreaterThan(170);
    expect(glideView(from, back, 1).angle).toBeCloseTo(-170);
  });
});

describe('viewBoxAttribute', () => {
  it('writes the view as SVG expects', () => {
    expect(viewBoxAttribute({ x: 1.5, y: -2, width: 30, height: 15 })).toBe('1.5 -2 30 15');
  });
});

describe('turnAttribute', () => {
  it('turns the store around the centre of the view', () => {
    expect(turnAttribute(quarter)).toBe('rotate(90 50 25)');
  });

  it('is no turn for a view with no angle', () => {
    expect(turnAttribute({ x: 0, y: 0, width: 10, height: 20 })).toBe('rotate(0 5 10)');
  });

  it('draws each store point where toStore finds it: the two turn the same way', () => {
    const turnedView = { x: 10, y: 20, width: 100, height: 50, angle: 30 };
    const [degrees, cx, cy] = turnAttribute(turnedView)
      .slice('rotate('.length, -1)
      .split(' ')
      .map(Number) as [number, number, number];
    const storePoint = { x: 70, y: 30 };
    // SVG's rotate(a cx cy), then the viewBox onto the screen.
    const cos = Math.cos((degrees * Math.PI) / 180);
    const sin = Math.sin((degrees * Math.PI) / 180);
    const dx = storePoint.x - cx;
    const dy = storePoint.y - cy;
    const drawn = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    const onScreen = {
      x: ((drawn.x - turnedView.x) * size.width) / turnedView.width,
      y: ((drawn.y - turnedView.y) * size.height) / turnedView.height,
    };
    expectNear(toStore(turnedView, size, onScreen), storePoint);
  });
});
