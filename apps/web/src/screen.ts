/** Which screen is showing; search includes its category pages. */
export type Screen = 'search' | 'route' | 'edit' | 'shopping' | 'finish';

/**
 * Where the logo bar shows (docs/plans/logo.md §1). Shopping and finish need the whole
 * screen for the map and the sheet. A record, not a list, so a new screen does not
 * typecheck until it says whether it has the bar.
 */
const topBarOn: Record<Screen, boolean> = {
  search: true,
  route: true,
  edit: true,
  shopping: false,
  finish: false,
};

export function showsTopBar(screen: Screen): boolean {
  return topBarOn[screen];
}
