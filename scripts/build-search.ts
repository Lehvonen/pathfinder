/**
 * `pnpm data:search`: the search half of the data build (docs/plans/search.md §2, §6).
 *
 * Reads data/normalised/ and data/curation/aliases.json, validates them, splits the
 * catalogue into tiers and writes the core search files to data/build/core/. Nothing is
 * written unless every check passes, and a re-run on unchanged input changes no bytes.
 * When `data:build` exists it calls the same functions from `@pathfinder/search/build`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { Category, Placement, Product } from '@pathfinder/core';
import { popularitySchema, validateNormalised } from '@pathfinder/scraper/schema';
import {
  buildCategoryTop,
  checkCategoryIds,
  EXCLUDED,
  FOOD,
  splitTiers,
  stableJson,
  TIER_OPTIONS,
  toTierData,
  validateAliases,
  validateBuild,
  type TierProduct,
} from '@pathfinder/search/build';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NORMALISED = join(ROOT, 'data/normalised');
const ALIASES = join(ROOT, 'data/curation/aliases.json');
const OUT = join(ROOT, 'data/build/core');
/** The search share of the 3 MB core budget (ARCHITECTURE.md §14). */
const BUDGET_BYTES = 1024 * 1024;
const MAX_PROBLEMS_SHOWN = 20;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

/** Stops the build, listing the first problems; nothing has been written yet. */
function fail(source: string, problems: readonly string[]): never {
  console.error(`✗ ${source}: ${problems.length} problem(s), nothing written`);
  for (const problem of problems.slice(0, MAX_PROBLEMS_SHOWN)) console.error(`  ${problem}`);
  if (problems.length > MAX_PROBLEMS_SHOWN) {
    console.error(`  … and ${problems.length - MAX_PROBLEMS_SHOWN} more`);
  }
  process.exit(1);
}

function check(source: string, problems: readonly string[]): void {
  if (problems.length > 0) fail(source, problems);
}

// 1. Read and validate every input.
const products = readJson(join(NORMALISED, 'products.json')) as Product[];
const placements = readJson(join(NORMALISED, 'placements.json')) as Placement[];
const categories = readJson(join(NORMALISED, 'categories.json')) as Category[];
check('data/normalised', validateNormalised({ products, placements, categories }));

const popularity = popularitySchema.safeParse(readJson(join(NORMALISED, 'popularity.json')));
if (!popularity.success) {
  fail(
    'popularity.json',
    popularity.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  );
}
const scores = popularity.data;
check(
  'popularity.json',
  products.filter((p) => !(p.ean in scores)).map((p) => `${p.ean} has no entry`),
);

const aliases = readJson(ALIASES);
check('data/curation/aliases.json', validateAliases(aliases));
check('top-level categories', checkCategoryIds(categories, { ...FOOD, ...EXCLUDED }));

// 2. Build tiers and category data, and check the result.
const ranked: TierProduct[] = products.map((p) => ({
  ean: p.ean,
  name: p.name,
  categoryId: p.categoryId,
  popularity: scores[p.ean] ?? null,
}));
const tiers = splitTiers(ranked, categories);
const { top, rank } = buildCategoryTop(ranked, categories);
check(
  'build output',
  validateBuild({
    products: ranked,
    tiers,
    categories,
    categoryTop: top,
    excluded: TIER_OPTIONS.excluded,
  }),
);

// 3. Serialise, check the budget, then write.
const files: Record<string, string> = {
  'search-tier-1.json': stableJson(toTierData(1, tiers[1])),
  'search-tier-2.json': stableJson(toTierData(2, tiers[2])),
  'search-tier-3.json': stableJson(toTierData(3, tiers[3])),
  'categories.json': stableJson(categories),
  'category-top.json': stableJson(top),
  'category-rank.json': stableJson(rank),
  'aliases.json': stableJson(aliases),
};
const gzipped = Object.fromEntries(
  Object.entries(files).map(([name, json]) => [name, gzipSync(json, { level: 9 }).length]),
);
const total = Object.values(gzipped).reduce((sum, size) => sum + size, 0);
check(
  'size budget',
  total > BUDGET_BYTES ? [`${kb(total)} gzipped, over the ${kb(BUDGET_BYTES)} search budget`] : [],
);

mkdirSync(OUT, { recursive: true });
for (const [name, json] of Object.entries(files)) writeFileSync(join(OUT, name), json + '\n');

console.log(`✓ ${products.length} products → data/build/core/`);
console.log(`  tiers: ${tiers[1].length} / ${tiers[2].length} / ${tiers[3].length}`);
for (const [name, size] of Object.entries(gzipped)) console.log(`  ${name.padEnd(20)} ${kb(size)}`);
console.log(`  ${'total, gzipped'.padEnd(20)} ${kb(total)} of ${kb(BUDGET_BYTES)}`);
