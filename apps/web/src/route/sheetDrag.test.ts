import { describe, expect, it } from 'vitest';
import { CLOSED_SHIFT, dragOffset, FLICK_SPEED, settlesOpen } from './sheetDrag';

const travel = 400;

describe('dragOffset', () => {
  it('follows the finger from where the sheet started', () => {
    expect(dragOffset(false, -100, travel)).toBe(300);
    expect(dragOffset(true, 100, travel)).toBe(100);
  });

  it('stays between open and closed', () => {
    expect(dragOffset(true, -50, travel)).toBe(0);
    expect(dragOffset(false, 50, travel)).toBe(travel);
  });
});

describe('settlesOpen', () => {
  it('ends at whichever end it is nearer after a slow drag', () => {
    expect(settlesOpen(false, -250, travel, 0)).toBe(true);
    expect(settlesOpen(false, -150, travel, 0)).toBe(false);
    expect(settlesOpen(true, 250, travel, 0)).toBe(false);
    expect(settlesOpen(true, 150, travel, 0)).toBe(true);
  });

  it('follows a flick, however short', () => {
    expect(settlesOpen(false, -20, travel, -FLICK_SPEED)).toBe(true);
    expect(settlesOpen(true, 20, travel, FLICK_SPEED)).toBe(false);
  });

  it('ignores a slow drift below the flick speed', () => {
    expect(settlesOpen(false, -20, travel, -FLICK_SPEED / 2)).toBe(false);
  });
});

describe('CLOSED_SHIFT', () => {
  it('matches shopping.css: 55svh of an 85svh sheet', () => {
    expect(CLOSED_SHIFT).toBeCloseTo(0.647, 3);
  });
});
