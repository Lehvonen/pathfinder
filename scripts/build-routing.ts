/**
 * `pnpm data:routing`: the routing half of the data build (ARCHITECTURE.md §5, §7, §9).
 *
 * Reads the store map (data/graph/) and the normalised catalogue, validates them, and
 * writes what the app needs to route a list to data/build/core/:
 *
 * - graph.json                 the walk graph, without its source `note`
 * - placements-primary.json    EAN → { nodeId, categoryId }, with the `:00` shelf fallback
 * - category-placements.json   categoryId → nodeId for generic entries; a ROUGH DRAFT,
 *                              generated until a hand-maintained table exists
 * - areas.json                 the map's areas, for stop names now and the map view later
 *
 * Nothing is written unless every check passes, and a re-run on unchanged input changes no
 * bytes. When `data:build` exists it calls the same functions from `@pathfinder/core/build`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { Category, Graph, Placement, Product } from '@pathfinder/core';
import { buildCategoryPlacements, buildPrimaryPlacements } from '@pathfinder/core/build';
import {
  type DepartmentSeen,
  graphSourceSchema,
  validateGraph,
  validateMapAreas,
  validateNormalised,
} from '@pathfinder/scraper/schema';
import { stableJson } from '@pathfinder/search/build';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NORMALISED = join(ROOT, 'data/normalised');
const GRAPH = join(ROOT, 'data/graph');
const OUT = join(ROOT, 'data/build/core');
/** The routing share of the 3 MB core budget (ARCHITECTURE.md §14); placements are most of it. */
const BUDGET_BYTES = 512 * 1024;
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

const areas = readJson(join(GRAPH, 'areas.json'));
check('data/graph/areas.json', validateMapAreas(areas));

const departments = readJson(join(NORMALISED, 'departments.json')) as DepartmentSeen[];
const graphSource = readJson(join(GRAPH, 'department-level.json'));
check('data/graph/department-level.json', validateGraph(graphSource, departments));
// Valid by the check above; parsed again only for its type. The note stays in the source.
const { version, nodes, edges, shelves } = graphSourceSchema.parse(graphSource);
const graph: Graph = { version, nodes, edges, shelves };

// 2. Place every product and every category on a node.
const primary = buildPrimaryPlacements(placements, products, graph.shelves);
check(
  'placements',
  primary.unplaced.map(({ ean, shelfId, reason }) => `${ean} on ${shelfId}: ${reason}`),
);
const categoryPlacements = buildCategoryPlacements(primary.placements, categories);

// 3. Serialise, check the budget, then write.
const files: Record<string, string> = {
  'graph.json': stableJson(graph),
  'placements-primary.json': stableJson(primary.placements),
  'category-placements.json': stableJson(categoryPlacements),
  'areas.json': stableJson(areas),
};
const gzipped = Object.fromEntries(
  Object.entries(files).map(([name, json]) => [name, gzipSync(json, { level: 9 }).length]),
);
const total = Object.values(gzipped).reduce((sum, size) => sum + size, 0);
check(
  'size budget',
  total > BUDGET_BYTES ? [`${kb(total)} gzipped, over the ${kb(BUDGET_BYTES)} routing budget`] : [],
);

mkdirSync(OUT, { recursive: true });
for (const [name, json] of Object.entries(files)) writeFileSync(join(OUT, name), json + '\n');

const placed = Object.keys(primary.placements).length;
console.log(`✓ ${placed} products, ${categoryPlacements.length} categories → data/build/core/`);
console.log(`  ${primary.fallbackCount} products placed through their department's :00 shelf`);
for (const [name, size] of Object.entries(gzipped)) console.log(`  ${name.padEnd(25)} ${kb(size)}`);
console.log(`  ${'total, gzipped'.padEnd(25)} ${kb(total)} of ${kb(BUDGET_BYTES)}`);
