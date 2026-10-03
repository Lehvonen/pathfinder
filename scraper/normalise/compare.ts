/**
 * Locale-independent string order for sorting output (docs/plans/normalise.md §4, rule
 * 12: the same input must give the same files on every machine). Compares UTF-16 code
 * units, the same order as the default `Array.prototype.sort`, unlike `localeCompare`,
 * whose order depends on the machine's locale.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
