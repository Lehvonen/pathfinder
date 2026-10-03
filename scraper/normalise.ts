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
 *   data/curation/departments.json                       hand-reviewed; new rows added here
 *   data/curation/categories.json                        optional: path → temperature
 *   data/curation/category-names.json                    optional: path → display name
 *   data/normalised/category-ids.json                    append-only id registry
 *
 * Writes data/normalised/: products.json, placements.json, categories.json,
 * category-ids.json, popularity.json, departments.json and report.md. While any department
 * is unreviewed or validation fails, only report.md (and the department table) is written
 * and the run exits with an error.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Placement, Product } from '@pathfinder/core';
import { buildCategories, categoryPathOf, type CategoryIds } from './normalise/categories';
import { cleanProducts } from './normalise/clean';
import {
  departmentLookups,
  departmentsSeen,
  reconcile,
  type CuratedDepartment,
} from './normalise/departments';
import { joinScrape, parseProducts, parseQueue } from './normalise/load';
import { renderReport } from './normalise/report';
import { validateNormalised } from './normalise/schema';

const ROOT = join(import.meta.dirname, '..');
const CACHE_DIR = join(import.meta.dirname, 'cache', 'kupittaa');
const CURATION_DIR = join(ROOT, 'data', 'curation');
const OUT_DIR = join(ROOT, 'data', 'normalised');

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
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
const scrapedAt = statSync(productsFile).mtime.toISOString().slice(0, 10);

const queue = parseQueue(readFileSync(queueFile, 'utf8'));
const parsed = parseProducts(readFileSync(productsFile, 'utf8'));
const joined = joinScrape(queue, parsed.records);

// Departments first: every later step depends on the reviewed table
mkdirSync(CURATION_DIR, { recursive: true });
const departmentsFile = join(CURATION_DIR, 'departments.json');
const seen = departmentsSeen(joined.products);
const departments = reconcile(readJson<CuratedDepartment[]>(departmentsFile, []), seen);
writeRecords(departmentsFile, departments.table);
const lookups = departmentLookups(departments.table);

const cleaned = cleanProducts(joined.products, lookups.kinds);
const categoryIdsFile = join(OUT_DIR, 'category-ids.json');
const categories = buildCategories({
  products: cleaned.products,
  ids: readJson<CategoryIds>(categoryIdsFile, {}),
  departmentTemperatures: lookups.temperatures,
  names: new Map(Object.entries(readJson(join(CURATION_DIR, 'category-names.json'), {}))),
  overrides: new Map(Object.entries(readJson(join(CURATION_DIR, 'categories.json'), {}))),
});

const products: Product[] = cleaned.products.map((p) => ({
  ean: p.ean,
  name: p.name,
  ...(p.brand && { brand: p.brand }),
  categoryId: categories.ids[categoryPathOf(p)]!,
}));
const placements: Placement[] = cleaned.products.map((p) => ({
  ean: p.ean,
  shelfId: p.shelfId,
  ...(p.shelfLevel !== undefined && { shelfLevel: p.shelfLevel }),
  isPrimary: true,
}));
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

// Map output: the department table plus what the scrape says about each department
const stats = new Map<string, { products: number; shelves: Set<string> }>();
for (const p of cleaned.products) {
  const s = stats.get(p.departmentId) ?? { products: 0, shelves: new Set<string>() };
  s.products++;
  s.shelves.add(p.shelfId);
  stats.set(p.departmentId, s);
}

writeRecords(join(OUT_DIR, 'products.json'), products);
writeRecords(join(OUT_DIR, 'placements.json'), placements);
writeRecords(join(OUT_DIR, 'categories.json'), categories.categories);
writeMap(categoryIdsFile, categories.ids);
writeMap(
  join(OUT_DIR, 'popularity.json'),
  Object.fromEntries(cleaned.products.map((p) => [p.ean, p.popularity])),
);
writeRecords(
  join(OUT_DIR, 'departments.json'),
  departments.table
    .filter((row) => seen.has(row.id))
    .map((row) => ({
      ...row,
      orderNumber: seen.get(row.id)?.orderNumber ?? null,
      zone: seen.get(row.id)?.zone ?? null,
      products: stats.get(row.id)?.products ?? 0,
      shelves: [...(stats.get(row.id)?.shelves ?? [])].sort(),
    })),
);

console.log(
  `${products.length} products, ${categories.categories.length} categories, ` +
    `${cleaned.exclusions.length} excluded. Written to data/normalised/.`,
);
