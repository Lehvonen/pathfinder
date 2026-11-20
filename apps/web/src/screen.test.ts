import { describe, expect, it } from 'vitest';
import { showsTopBar } from './screen';

describe('showsTopBar', () => {
  it('shows the logo bar on search, the route overview and the edit list', () => {
    expect(showsTopBar('search')).toBe(true);
    expect(showsTopBar('route')).toBe(true);
    expect(showsTopBar('edit')).toBe(true);
  });

  it('hides it while shopping and on the finish card, where the map needs the screen', () => {
    expect(showsTopBar('shopping')).toBe(false);
    expect(showsTopBar('finish')).toBe(false);
  });
});
