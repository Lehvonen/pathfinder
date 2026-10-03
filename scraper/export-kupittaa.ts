/*
 * Whole-store export for K-Citymarket Turku Kupittaa (N119): every product with its
 * name, price and in-store location (department, shelf, level).
 *
 * Reuses the browser session from p18a/mcp-k-ruoka (see docs/ARCHITECTURE.md §7), which
 * must be cloned and installed first. Its code is loaded at runtime rather than copied,
 * because the upstream repo has no licence.
 *
 * Polite by design: one request at a time with a fixed delay, and it STOPS on any block,
 * 401/403/429/503 or HTML response instead of resetting the session and retrying around
 * it. Progress is saved after every request, so stopping and rerunning resumes.
 *
 * Usage (from the repo root):
 *   bun run scraper/export-kupittaa.ts            collect, then scrape, then csv
 *   bun run scraper/export-kupittaa.ts collect    phase 1: every product's EAN, name and
 *                                                 price from the listing (~450 requests)
 *   bun run scraper/export-kupittaa.ts scrape     phase 2: each product's location, one
 *                                                 request per product
 *   bun run scraper/export-kupittaa.ts extra      list only the EXTRA_CATEGORIES, then csv
 *   bun run scraper/export-kupittaa.ts csv        merge both into kupittaa.csv, no network
 *   bun run scraper/export-kupittaa.ts status     progress counts, no network
 *
 * Environment:
 *   MCP_K_RUOKA_DIR   clone of p18a/mcp-k-ruoka   (default C:/dev/mcp-k-ruoka)
 *   DELAY_MS          pause between requests      (default 1500)
 *   LIMIT             stop phase 2 after N products, for a trial run
 *   EXTRA_CATEGORIES  comma-separated category paths to list as well, for subcategories the
 *                     automatic discovery misses (copy them from the k-ruoka.fi address bar)
 *
 * Output, in scraper/cache/kupittaa/ (gitignored):
 *   queue.json        every listed product: ean, name, brand, price, slug, category
 *   products.ndjson   one record per product with its location, appended as it goes
 *   kupittaa.csv      ean;name;brand;price;unit price;location;popularity, one row per product
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  categorySlugs,
  csvCell,
  isObject,
  normalPricing,
  num,
  parseRecords,
  popularityRanks,
  productName,
  str,
  toQueueItem,
  type Json,
  type QueueItem,
} from './kupittaa-format';

const STORE_ID = 'N119';
const PAGE_SIZE = 100;
// Safety cap only. In practice K-Ruoka answers HTTP 400 past roughly offset 1,000, which
// collectListing treats as the end of that listing and then splits it into categories
const MAX_WINDOW = 10_000;
const DELAY_MS = Number(process.env.DELAY_MS) || 1500;
const LIMIT = Number(process.env.LIMIT) || Infinity;
const EXTRA_CATEGORIES = (process.env.EXTRA_CATEGORIES ?? '')
  .split(',')
  .map((path) => path.trim().replace(/^\/+|\/+$/g, ''))
  .filter(Boolean);
const STOP_STATUSES = new Set([401, 403, 429, 503]);

const MCP_DIR = process.env.MCP_K_RUOKA_DIR ?? 'C:/dev/mcp-k-ruoka';
const OUT_DIR = join(import.meta.dirname, 'cache', 'kupittaa');
const QUEUE_FILE = join(OUT_DIR, 'queue.json');
const PRODUCTS_FILE = join(OUT_DIR, 'products.ndjson');
const CSV_FILE = join(OUT_DIR, 'kupittaa.csv');
const AGGREGATIONS_FILE = join(OUT_DIR, 'aggregations.json');

interface Session {
  getPage: () => Promise<{
    evaluate: <R, A>(fn: (arg: A) => Promise<R>, arg: A) => Promise<R>;
  }>;
  getBuildNumber: () => string;
}

class StopError extends Error {}

class HttpError extends StopError {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`HTTP ${status} on ${path}.`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadSession(): Promise<Session> {
  const file = join(MCP_DIR, 'src', 'browser', 'session.ts');
  if (!existsSync(file)) {
    throw new StopError(`mcp-k-ruoka not found at ${MCP_DIR}. Clone it or set MCP_K_RUOKA_DIR.`);
  }
  return (await import(pathToFileURL(file).href)) as Session;
}

async function request(session: Session, method: 'GET' | 'POST', path: string): Promise<Json> {
  const page = await session.getPage();
  const res = await page.evaluate(
    async ({ method, path, build }) => {
      const r = await fetch(path, {
        method,
        headers: { accept: 'application/json', 'x-k-build-number': build },
      });
      return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
    },
    { method, path, build: session.getBuildNumber() },
  );

  if (STOP_STATUSES.has(res.status)) {
    throw new StopError(
      `HTTP ${res.status} on ${path}. The site is refusing or rate-limiting us. ` +
        'Stop for now and rerun later with a larger DELAY_MS.',
    );
  }
  if (!res.type.includes('json')) {
    throw new StopError(`Got ${res.type || 'no content type'} instead of JSON on ${path}.`);
  }
  if (res.status === 404) return {};
  if (res.status >= 400) throw new HttpError(res.status, path);
  const json: unknown = JSON.parse(res.body);
  if (!isObject(json)) throw new StopError(`Unexpected response shape on ${path}.`);
  return json;
}

function listPath(categoryPath: string | null, offset: number): string {
  const params = new URLSearchParams({
    offset: String(offset),
    language: 'fi',
    storeId: STORE_ID,
    limit: String(PAGE_SIZE),
    discountFilter: 'false',
    isTrOffer: 'false',
  });
  if (categoryPath) params.set('categoryPath', categoryPath);
  return `/kr-api/v2/product-search/?${params}`;
}

const storeOf = (product: Json): string | null =>
  isObject(product.store) ? str(product.store.id) : null;

/** For the listing: a product from another store means the session is on the wrong store. */
function checkStore(product: Json) {
  const storeId = storeOf(product);
  if (storeId && storeId !== STORE_ID) {
    throw new StopError(`Response is for store ${storeId}, expected ${STORE_ID}.`);
  }
}

function readQueue(): Map<string, QueueItem> {
  if (!existsSync(QUEUE_FILE)) return new Map();
  const items: Partial<QueueItem>[] = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
  // Queues saved before the listing kept names and prices lack those fields
  return new Map(
    items
      .filter((item) => typeof item.ean === 'string')
      .map((item) => [
        item.ean ?? '',
        {
          ean: item.ean ?? '',
          name: item.name ?? null,
          brand: item.brand ?? null,
          price: item.price ?? null,
          unitPrice: item.unitPrice ?? null,
          slug: item.slug ?? null,
          popularity: item.popularity ?? 0,
          categoryPath: item.categoryPath ?? null,
        },
      ]),
  );
}

function writeQueue(queue: Map<string, QueueItem>) {
  // Write then rename, so an interruption mid-write cannot leave a truncated queue
  writeFileSync(`${QUEUE_FILE}.tmp`, JSON.stringify([...queue.values()], null, 1));
  renameSync(`${QUEUE_FILE}.tmp`, QUEUE_FILE);
}

/** Every record saved so far; see parseRecords for damaged lines. */
function readRecords(): Json[] {
  if (!existsSync(PRODUCTS_FILE)) return [];
  const { records, damaged } = parseRecords(readFileSync(PRODUCTS_FILE, 'utf8'));
  if (damaged > 0) console.warn(`Skipping ${damaged} damaged line(s) in products.ndjson`);
  return records;
}

function readDone(): Set<string> {
  return new Set(
    readRecords()
      .map((r) => str(r.ean))
      .filter((e) => e !== null),
  );
}

/**
 * Pages through one listing. K-Ruoka refuses deep offsets, so when a listing is larger
 * than it will page, this recurses into the next category level found on the products
 * themselves. Returns the listing's totalHits.
 */
async function collectListing(
  session: Session,
  queue: Map<string, QueueItem>,
  categoryPath: string | null,
  depth: number,
): Promise<number> {
  const label = categoryPath ?? '(all)';
  const children = new Set<string>();
  let total = 0;
  let offset = 0;

  while (offset < MAX_WINDOW) {
    let json: Json;
    try {
      json = await request(session, 'POST', listPath(categoryPath, offset));
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 400) throw err;
      // Past the deepest offset K-Ruoka allows: the rest comes from the categories below
      if (offset > 0) break;
      console.warn(`⚠ ${label}: HTTP 400 on the first page, skipping this category`);
      return 0;
    }
    if (categoryPath === null && offset === 0 && json.aggregations !== undefined) {
      // Kept for inspection: may list every category, if category discovery ever misses one
      writeFileSync(AGGREGATIONS_FILE, JSON.stringify(json.aggregations, null, 1));
    }
    const result = Array.isArray(json.result) ? json.result : [];
    total = num(json.totalHits) ?? total;
    const products = result
      .map((r) => (isObject(r) && isObject(r.product) ? r.product : null))
      .filter((p) => p !== null);
    if (products.length === 0) break;

    let added = 0;
    for (const product of products) {
      checkStore(product);
      const child = categorySlugs(product)[depth];
      if (child) children.add(child);
      const item = toQueueItem(product);
      if (!item) continue;
      if (!queue.has(item.ean)) added++;
      // Overwrite on a rerun so names and prices stay current
      queue.set(item.ean, item);
    }
    writeQueue(queue);
    offset += products.length;
    console.log(`${label} ${offset}/${total}: +${added} new, ${queue.size} queued`);
    await sleep(DELAY_MS);
    if (offset >= total) break;
  }

  if (total > offset) {
    if (children.size === 0) {
      console.warn(
        `⚠ ${label}: ${total - offset} products could not be paged and have no subcategories`,
      );
      return total;
    }
    console.log(
      `${label}: ${total} products, more than K-Ruoka pages; splitting into ${children.size} categories`,
    );
    // Tree slugs are full paths already ("maito-juusto-munat-ja-rasvat/maidot-ja-piimat")
    let covered = 0;
    for (const child of children) {
      covered += await collectListing(session, queue, child, depth + 1);
    }
    // Subcategories are discovered from the products this listing returned before the
    // offset limit, so a small one with none among them is never seen
    if (total - covered > Math.max(20, total * 0.01)) {
      console.warn(
        `⚠ ${label}: subcategories cover ${covered} of ${total}. Find the missing ones on ` +
          'k-ruoka.fi and add them with EXTRA_CATEGORIES',
      );
    }
  }
  return total;
}

async function collectExtra(session: Session, queue: Map<string, QueueItem>) {
  for (const path of EXTRA_CATEGORIES) {
    const before = queue.size;
    await collectListing(session, queue, path, path.split('/').length);
    console.log(`extra ${path}: +${queue.size - before} new products`);
  }
}

function trim(p: Json, item: QueueItem): Json {
  const pricing =
    isObject(p.mobilescan) && isObject(p.mobilescan.pricing) ? p.mobilescan.pricing : {};
  const normal = normalPricing(p);
  const batch = isObject(pricing.batch) ? pricing.batch : null;
  const loc = isObject(p.location) ? p.location : null;
  const dept = loc && isObject(loc.department) ? loc.department : null;
  const name = productName(p) ?? item.name;
  const category = isObject(p.category) ? p.category : {};
  return {
    ean: item.ean,
    name,
    brand: isObject(p.brand) ? str(p.brand.name) : null,
    storeId: isObject(p.store) ? str(p.store.id) : null,
    isAvailable: p.isAvailable ?? null,
    popularity: num(p.popularity) ?? item.popularity,
    categoryPath: str(category.path) ?? item.categoryPath,
    categoryTree: categorySlugs(p),
    location: loc
      ? {
          segment: str(loc.segment),
          shelf: str(loc.module),
          level: str(loc.level),
          department: dept
            ? {
                id: str(dept.id),
                name: str(dept.name),
                orderNumber: num(dept.orderNumber),
                zone: isObject(dept.zone) ? str(dept.zone.name) : null,
                isPublic: dept.isPublic ?? null,
              }
            : null,
        }
      : null,
    price: normal
      ? { price: num(normal.price), unit: str(normal.unit), unitPrice: normal.unitPrice ?? null }
      : null,
    batchPrice: batch ? { price: num(batch.price), amount: num(batch.amount) } : null,
    scrapedAt: new Date().toISOString(),
  };
}

async function collect(session: Session) {
  const queue = readQueue();
  console.log(`Collecting product list for ${STORE_ID}, ${queue.size} already queued`);
  const total = await collectListing(session, queue, null, 0);
  await collectExtra(session, queue);
  if (queue.size === 0) {
    throw new StopError(
      'The unfiltered listing returned no products. Open a category page on k-ruoka.fi, ' +
        'check the product-search request in DevTools and compare it with listPath().',
    );
  }
  console.log(`collect finished: ${queue.size} products queued, K-Ruoka reports ${total}`);
  if (queue.size < total * 0.95) {
    console.warn(
      `⚠ ${total - queue.size} products missing. See the subcategory warnings above and add ` +
        'the missing categories with EXTRA_CATEGORIES.',
    );
  }
}

async function scrape(session: Session) {
  const done = readDone();
  const todo = [...readQueue().values()]
    .filter((item) => !done.has(item.ean))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, LIMIT);
  console.log(
    `${todo.length} products to fetch, ~${Math.round((todo.length * DELAY_MS) / 60_000)} min`,
  );

  // Close off a half-written last line, or the next record would be glued onto it
  if (existsSync(PRODUCTS_FILE) && !readFileSync(PRODUCTS_FILE, 'utf8').endsWith('\n')) {
    appendFileSync(PRODUCTS_FILE, '\n');
  }

  const started = Date.now();
  for (const [i, item] of todo.entries()) {
    const params = new URLSearchParams({
      storeId: STORE_ID,
      returnLocalProductsFromOtherStores: 'true',
    });
    const json = await request(
      session,
      'GET',
      `/kr-api/v4/products/${encodeURIComponent(item.slug ?? item.ean)}?${params}`,
    );
    const product = isObject(json.product) ? json.product : null;
    // returnLocalProductsFromOtherStores can answer for another store. Record it and move on:
    // stopping here would stop every rerun at the same product, since the order is fixed
    const storeId = product ? storeOf(product) : null;
    const record = !product
      ? { ean: item.ean, error: 'no product' }
      : storeId && storeId !== STORE_ID
        ? { ean: item.ean, error: 'other store', storeId }
        : trim(product, item);
    appendFileSync(PRODUCTS_FILE, JSON.stringify(record) + '\n');

    if ((i + 1) % 25 === 0) {
      const minutesLeft = Math.round(
        ((todo.length - i - 1) * (Date.now() - started)) / (i + 1) / 60_000,
      );
      console.log(`${i + 1}/${todo.length} fetched, ~${minutesLeft} min left`);
    }
    await sleep(DELAY_MS);
  }
  console.log('scrape finished');
}

const CSV_COLUMNS = [
  'ean',
  'name',
  'brand',
  'price',
  'unit_price',
  'department',
  'shelf',
  'level',
  'zone',
  'department_order',
  'popularity',
  'popularity_rank',
] as const;

/**
 * One row per listed product. Location columns stay empty for products phase 2 has not
 * reached yet, so this is useful after collect alone. Semicolons and a BOM, so Excel
 * with Finnish settings opens it in columns with ä and ö intact.
 */
function writeCsv() {
  const queue = readQueue();
  const located = new Map<string, Json>();
  for (const record of readRecords()) {
    const ean = str(record.ean);
    if (ean && !record.error) located.set(ean, record);
  }

  const ranks = popularityRanks([...queue.values()]);
  const rows = [...queue.values()].map((item) => {
    const record = located.get(item.ean);
    const loc = record && isObject(record.location) ? record.location : null;
    const dept = loc && isObject(loc.department) ? loc.department : null;
    const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      ean: item.ean,
      name: item.name ?? str(record?.name),
      brand: item.brand,
      // Decimal comma, or Finnish Excel reads 0.89 as text
      price: item.price?.toFixed(2).replace('.', ','),
      unit_price: item.unitPrice,
      department: dept?.name,
      shelf: loc?.shelf,
      level: loc?.level,
      zone: dept?.zone,
      department_order: dept?.orderNumber,
      popularity: item.popularity.toFixed(1).replace('.', ','),
      popularity_rank: ranks.get(item.ean),
    };
    return CSV_COLUMNS.map((column) => csvCell(row[column])).join(';');
  });

  writeFileSync(CSV_FILE, '\uFEFF' + [CSV_COLUMNS.join(';'), ...rows].join('\r\n') + '\r\n');
  console.log(`Wrote ${rows.length} rows to ${CSV_FILE}`);
}

function status() {
  const queue = readQueue();
  const records = readRecords();
  const withLocation = records.filter(
    (r) => isObject(r.location) && isObject(r.location.department),
  ).length;
  const errors = records.filter((r) => r.error).length;
  console.table({
    queued: queue.size,
    fetched: records.length,
    withLocation,
    withoutLocation: records.length - withLocation - errors,
    errors,
  });
}

const phase = process.argv[2] ?? 'all';
mkdirSync(OUT_DIR, { recursive: true });

try {
  if (phase === 'status') {
    status();
  } else if (phase === 'csv') {
    writeCsv();
  } else if (phase === 'extra') {
    if (EXTRA_CATEGORIES.length === 0) {
      throw new StopError('Set EXTRA_CATEGORIES, e.g. EXTRA_CATEGORIES=juomat/lonkerot');
    }
    const queue = readQueue();
    await collectExtra(await loadSession(), queue);
    console.log(`${queue.size} products queued`);
    writeCsv();
  } else if (['all', 'collect', 'scrape'].includes(phase)) {
    const session = await loadSession();
    if (phase !== 'scrape') await collect(session);
    if (phase !== 'collect') await scrape(session);
    writeCsv();
    status();
  } else {
    throw new StopError(
      `Unknown phase "${phase}". Use collect, scrape, extra, csv, status or nothing.`,
    );
  }
  process.exit(0);
} catch (err) {
  if (!(err instanceof StopError)) throw err;
  console.error(` Stopped: ${err.message}\nProgress is saved; rerun the same command to resume.`);
  process.exit(1);
}
