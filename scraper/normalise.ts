/*
 * The data cleaner: turns the raw Kupittaa scrape into records shaped like
 * packages/core/src/types.ts. See docs/plans/normalise.md. All I/O lives here; the rules
 * are in normalise/.
 *
 * Usage (from the repo root):
 *   bun run scraper/normalise.ts
 *
 * Reads:
 *   scraper/cache/kupittaa/queue.json, products.ndjson   the scrape (export-kupittaa.ts)
 *   scraper/cache/kupittaa/category-names.json           path → Finnish name, from the listing
 *   data/curation/departments.json                       hand-reviewed; new rows added here
 *   data/curation/categories.json                        optional: path → temperature
 *   data/normalised/category-ids.json                    append-only id registry
 *
 * Writes data/normalised/: products.json, placements.json, categories.json,
 * category-ids.json, popularity.json, departments.json and report.md. Every input is
 * checked before anything is written. While any department is unreviewed or validation
 * fails, only report.md (and the department table) is written and the run exits with an
 * error.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { buildCategories } from './normalise/categories';
import { cleanProducts } from './normalise/clean';
import { departmentLookups, departmentsSeen, reconcile } from './normalise/departments';
import { joinScrape, parseProducts, parseQueue } from './normalise/load';
import { departmentStats, departmentSummary, toContract } from './normalise/records';
import { renderReport } from './normalise/report';
import {
  categoryIdsSchema,
  categoryNamesSchema,
  categoryOverridesSchema,
  curatedDepartmentsSchema,
  validateNormalised,
} from './normalise/schema';

const ROOT = join(import.meta.dirname, '..');
const CACHE_DIR = join(import.meta.dirname, 'cache', 'kupittaa');
const CURATION_DIR = join(ROOT, 'data', 'curation');
const OUT_DIR = join(ROOT, 'data', 'normalised');

/** A JSON input checked against its schema; a missing file gives the fallback. */
function readJson<T>(file: string, schema: z.ZodType<T>, fallback: T): T {
  if (!existsSync(file)) return fallback;
  const name = relative(ROOT, file);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${name} is not valid JSON: ${(err as Error).message}`);
  }
  const result = schema.safeParse(json);
  if (!result.success)
    fail(`${name} is not valid:
${z.prettifyError(result.error)}`);
  return result.data;
}

/** One record per line, so git diffs and diff.ts show changes product by product. */
function writeRecords(file: string, records: unknown[]) {
  const lines = records.map((record) => `  ${JSON.stringify(record)}`);
  writeFileSync(file, `[\n${lines.join(',\n')}\n]\n`);
}

/** One entry per line, keys sorted, for the same reason. */
function writeMap(file: string, map: Record<string, unknown>) {
  const lines = Object.keys(map)
    .sort()
    .map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(map[key])}`);
  writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const queueFile = join(CACHE_DIR, 'queue.json');
const productsFile = join(CACHE_DIR, 'products.ndjson');
if (!existsSync(queueFile) || !existsSync(productsFile)) {
  fail(`No scrape in ${CACHE_DIR}. Run scraper/export-kupittaa.ts first.`);
}
// The local date, so a scrape finishing just after midnight is not dated the day before
const scrapedAt = statSync(productsFile).mtime.toLocaleDateString('sv-SE');

const queue = parseQueue(readFileSync(queueFile, 'utf8'));
const parsed = parseProducts(readFileSync(productsFile, 'utf8'));
const joined = joinScrape(queue, parsed.records);

// Every input is read and checked before anything is written
const departmentsFile = join(CURATION_DIR, 'departments.json');
const categoryIdsFile = join(OUT_DIR, 'category-ids.json');
const table = readJson(departmentsFile, curatedDepartmentsSchema, []);
const ids = readJson(categoryIdsFile, categoryIdsSchema, {});
// Written by the exporter's listing; a broken file means re-running `collect`
const names = readJson(join(CACHE_DIR, 'category-names.json'), categoryNamesSchema, {});
const overrides = readJson(join(CURATION_DIR, 'categories.json'), categoryOverridesSchema, {});

// Departments first: every later step depends on the reviewed table
const seen = departmentsSeen(joined.products);
const departments = reconcile(table, seen);
mkdirSync(CURATION_DIR, { recursive: true });
writeRecords(departmentsFile, departments.table);
const lookups = departmentLookups(departments.table);

const cleaned = cleanProducts(joined.products, lookups.kinds);
const categories = buildCategories({
  products: cleaned.products,
  ids,
  departmentTemperatures: lookups.temperatures,
  names: new Map(Object.entries(names)),
  overrides: new Map(Object.entries(overrides)),
});

const { products, placements } = toContract(cleaned.products, categories.ids);
const validationErrors = validateNormalised({
  products,
  placements,
  categories: categories.categories,
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, 'report.md'),
  renderReport({
    scrapedAt,
    queued: queue.length,
    products: cleaned.products,
    loadIssues: [...parsed.issues, ...joined.issues],
    exclusions: cleaned.exclusions,
    departments,
    categories,
    validationErrors,
  }),
);

if (departments.unreviewed.length > 0) {
  fail(
    `${departments.unreviewed.length} departments in data/curation/departments.json are unreviewed. ` +
      'Check kind and temperature for each, delete "reviewed": false, and run again. ' +
      'data/normalised/report.md has product counts per department to help.',
  );
}
if (validationErrors.length > 0) {
  fail(`Validation failed with ${validationErrors.length} errors; see data/normalised/report.md.`);
}

writeRecords(join(OUT_DIR, 'products.json'), products);
writeRecords(join(OUT_DIR, 'placements.json'), placements);
writeRecords(join(OUT_DIR, 'categories.json'), categories.categories);
writeMap(categoryIdsFile, categories.ids);
writeMap(
  join(OUT_DIR, 'popularity.json'),
  Object.fromEntries(cleaned.products.map((p) => [p.ean, p.popularity])),
);
// For the map work: the department table plus what the scrape says about each department
writeRecords(
  join(OUT_DIR, 'departments.json'),
  departmentSummary(departments.table, seen, departmentStats(cleaned.products)),
);

console.log(
  `${products.length} products, ${categories.categories.length} categories, ` +
    `${cleaned.exclusions.length} excluded. Written to data/normalised/.`,
);
