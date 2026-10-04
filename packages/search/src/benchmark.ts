// Shared by the PC benchmark (scripts/bench-search.ts) and the phone benchmark in the web
// app, so both measure the same thing (docs/plans/search.md step 8).

/** The engine's budget per keystroke, at p95 (docs/plans/search.md §10). */
export const ENGINE_BUDGET_MS = 5;
/** Keystroke to results on screen, at p95, on the oldest team phone (ARCHITECTURE.md §14). */
export const PAINT_BUDGET_MS = 50;

/** Typing sequences: everyday words, compounds, aliases, multi-word, and no-match cases. */
export const BENCH_SEQUENCES: readonly string[] = [
  'maito',
  'leipä',
  'jauheliha',
  'vessapaperi',
  'kana',
  'maito laktoositon',
  'maito laktoositonx', // multi-word no-match: the review's slowest case
  'maito xyzq',
  'pirkka zzz',
  'xyz', // single-word no-match: a full pass over every tier
  'pesuaine',
  'creme fraiche',
];

/** Every prefix of `text`, as typed one character at a time: m, ma, mai, … */
export function prefixes(text: string): string[] {
  return Array.from(text, (_, i) => text.slice(0, i + 1));
}

/** The `p`th percentile of `sorted` (ascending), nearest rank; `NaN` for no values. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}
