/**
 * Whether the search box counts as empty: nothing but spaces. Search then shows no results,
 * and the search screen shows "Usein ostamasi" in their place (docs/plans/device-storage.md
 * §4). One rule for both, so they never disagree.
 */
export function isEmptyQuery(query: string): boolean {
  return query.trim() === '';
}
