/*
 * Parses the raw scrape (queue.json + products.ndjson) and joins it into one record per
 * EAN. Pure: takes file contents, not paths, so the CLI owns all I/O.
 *
 * The queue is the source for name, brand, category and popularity: every product has a
 * listing entry, and the product endpoint returns brand: null for ~4k products the
 * listing names. The ndjson is the source for location and availability.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export interface RawDepartment {
  id: string | null;
  name: string | null;
  orderNumber: number | null;
  zone: string | null;
  isPublic: boolean | null;
}

/** `segment` is left out: it is not 1:1 with shelves and its meaning is unknown. */
export interface RawLocation {
  shelf: string | null;
  level: string | null;
  department: RawDepartment | null;
}

export interface RawProduct {
  ean: string;
  name: string | null;
  brand: string | null;
  categoryPath: string | null;
  popularity: number;
  isAvailable: boolean | null;
  location: RawLocation | null;
}

export type LoadIssueReason = 'not-fetched' | 'not-queued' | 'duplicate-record' | 'damaged-line';

export interface LoadIssue {
  ean: string | null; // null for a line too damaged to read
  reason: LoadIssueReason;
}

interface QueueEntry {
  ean: string;
  name: string | null;
  brand: string | null;
  categoryPath: string | null;
  popularity: number;
}

interface FetchedRecord {
  ean: string;
  name: string | null;
  brand: string | null;
  categoryPath: string | null;
  isAvailable: boolean | null;
  location: RawLocation | null;
}

export function parseQueue(text: string): QueueEntry[] {
  const items: unknown = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('queue.json is not an array');
  return items.filter(isObject).flatMap((item) => {
    const ean = str(item.ean);
    if (ean === null) return [];
    return [
      {
        ean,
        name: str(item.name),
        brand: str(item.brand),
        categoryPath: str(item.categoryPath),
        popularity: num(item.popularity) ?? 0,
      },
    ];
  });
}

function parseLocation(v: unknown): RawLocation | null {
  if (!isObject(v)) return null;
  const dept = isObject(v.department) ? v.department : null;
  return {
    shelf: str(v.shelf),
    level: str(v.level),
    department: dept
      ? {
          id: str(dept.id),
          name: str(dept.name),
          orderNumber: num(dept.orderNumber),
          zone: str(dept.zone),
          isPublic: bool(dept.isPublic),
        }
      : null,
  };
}

/** A run killed mid-write can leave a half line; it is reported, not fatal. */
export function parseProducts(text: string): { records: FetchedRecord[]; issues: LoadIssue[] } {
  const records: FetchedRecord[] = [];
  const issues: LoadIssue[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      issues.push({ ean: null, reason: 'damaged-line' });
      continue;
    }
    const ean = isObject(record) ? str(record.ean) : null;
    if (!isObject(record) || ean === null) {
      issues.push({ ean: null, reason: 'damaged-line' });
      continue;
    }
    records.push({
      ean,
      name: str(record.name),
      brand: str(record.brand),
      categoryPath: str(record.categoryPath),
      isAvailable: bool(record.isAvailable),
      location: parseLocation(record.location),
    });
  }
  return { records, issues };
}

/**
 * One RawProduct per EAN that is both queued and fetched. A product queued but not yet
 * fetched (a scrape still running) or fetched but no longer queued is reported and left
 * out. A repeated ndjson record is reported and the last one wins, as in the exporter.
 */
export function joinScrape(
  queue: QueueEntry[],
  records: FetchedRecord[],
): { products: RawProduct[]; issues: LoadIssue[] } {
  const issues: LoadIssue[] = [];
  const fetched = new Map<string, FetchedRecord>();
  for (const record of records) {
    if (fetched.has(record.ean)) issues.push({ ean: record.ean, reason: 'duplicate-record' });
    fetched.set(record.ean, record);
  }

  const queued = new Set<string>();
  const products: RawProduct[] = [];
  for (const entry of queue) {
    queued.add(entry.ean);
    const record = fetched.get(entry.ean);
    if (!record) {
      issues.push({ ean: entry.ean, reason: 'not-fetched' });
      continue;
    }
    products.push({
      ean: entry.ean,
      name: entry.name ?? record.name,
      brand: entry.brand ?? record.brand,
      categoryPath: entry.categoryPath ?? record.categoryPath,
      popularity: entry.popularity,
      isAvailable: record.isAvailable,
      location: record.location,
    });
  }
  for (const ean of fetched.keys()) {
    if (!queued.has(ean)) issues.push({ ean, reason: 'not-queued' });
  }
  return { products, issues };
}
