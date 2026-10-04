/**
 * `pnpm bench:search`: times the search engine on the real catalogue in data/build/core/
 * (docs/plans/search.md step 8). Types each sequence one character at a time, as a shopper
 * would, and reports per-keystroke p50 / p95 / max of `engine.search`, plus how long each
 * tier takes to parse and index. These are PC numbers; the oldest-phone run is the web
 * bench, which also measures rendering.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Category } from '@pathfinder/core';
import {
  BENCH_SEQUENCES,
  createSearchEngine,
  ENGINE_BUDGET_MS,
  percentile,
  prefixes,
  type Aliases,
  type CategoryRank,
  type CategoryTop,
  type TierData,
} from '@pathfinder/search';

const CORE = fileURLToPath(new URL('../data/build/core/', import.meta.url));
const RUNS = 50;
const time = <T>(work: () => T): [T, number] => {
  const start = performance.now();
  const result = work();
  return [result, performance.now() - start];
};
const ms = (value: number) => `${value.toFixed(3)} ms`;

// Loading: parse and index each tier, as the app does.
const json = <T>(name: string) => JSON.parse(readFileSync(join(CORE, name), 'utf8')) as T;
const engine = createSearchEngine({
  categories: json<Category[]>('categories.json'),
  categoryTop: json<CategoryTop>('category-top.json'),
  categoryRank: json<CategoryRank>('category-rank.json'),
  aliases: json<Aliases>('aliases.json'),
  yieldFn: async () => {},
});
console.log('Loading (parse + index):');
for (const tier of [1, 2, 3]) {
  const [data, parse] = time(() => json<TierData>(`search-tier-${tier}.json`));
  const start = performance.now();
  await engine.addTier(data);
  const index = performance.now() - start;
  console.log(
    `  tier ${tier}: ${data.eans.length} products, parse ${ms(parse)}, index ${ms(index)}`,
  );
}

// The engine builds the typo vocabulary in idle chunks after the last tier; wait for it,
// or the keystrokes below would never reach typo correction.
const vocabularyStart = performance.now();
while (!engine.typoReady()) await new Promise((resolve) => setTimeout(resolve, 0));
console.log(`  typo vocabulary: ready ${ms(performance.now() - vocabularyStart)} after tier 3`);

// Keystrokes: every prefix of every sequence, RUNS times each after one warm-up pass.
for (const text of BENCH_SEQUENCES) for (const prefix of prefixes(text)) engine.search(prefix);

const all: number[] = [];
console.log(`\nPer keystroke, ${RUNS} runs each:`);
for (const text of BENCH_SEQUENCES) {
  const times: number[] = [];
  for (const prefix of prefixes(text)) {
    for (let run = 0; run < RUNS; run++) times.push(time(() => engine.search(prefix))[1]);
  }
  times.sort((a, b) => a - b);
  all.push(...times);
  const top = engine.search(text).products[0]?.name ?? '—';
  console.log(
    `  ${text.padEnd(20)} p50 ${ms(percentile(times, 50))}  p95 ${ms(percentile(times, 95))}` +
      `  max ${ms(times.at(-1)!)}  first: ${top}`,
  );
}
all.sort((a, b) => a - b);
const p95 = percentile(all, 95);
console.log(
  `\nAll keystrokes: p50 ${ms(percentile(all, 50))}, p95 ${ms(p95)}, max ${ms(all.at(-1)!)}` +
    ` (budget: p95 under ${ENGINE_BUDGET_MS} ms) ${p95 < ENGINE_BUDGET_MS ? '✓' : '✗'}`,
);
