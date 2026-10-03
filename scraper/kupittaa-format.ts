/*
 * Pure helpers for export-kupittaa.ts: reading K-Ruoka's product JSON and formatting the
 * CSV. No I/O and no side effects on import, so they can be tested; the exporter itself
 * runs its CLI when imported.
 */

export type Json = Record<string, unknown>;

export interface QueueItem {
  ean: string;
  name: string | null;
  brand: string | null;
  price: number | null;
  unitPrice: string | null;
  slug: string | null;
  popularity: number;
  categoryPath: string | null;
}

export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
export const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Finnish decimal comma, or Finnish Excel reads 0.89 as text. */
export const fiDecimal = (value: number, digits: number): string =>
  value.toFixed(digits).replace('.', ',');

export const categoryOf = (product: Json): Json =>
  isObject(product.category) ? product.category : {};

/** The product's mobilescan.pricing object: `normal` and, on offer, `batch`. */
export const pricing = (product: Json): Json =>
  isObject(product.mobilescan) && isObject(product.mobilescan.pricing)
    ? product.mobilescan.pricing
    : {};

/**
 * LIMIT for a trial run: unset or empty means no limit, `0` means fetch none. Anything but
 * a plain non-negative integer is refused rather than guessed at.
 */
export function parseLimit(value: string | undefined): number {
  if (value === undefined || value === '') return Infinity;
  if (!/^\d+$/.test(value)) throw new Error(`LIMIT must be a whole number, got "${value}".`);
  return Number(value);
}

export function categorySlugs(product: Json): string[] {
  const category = categoryOf(product);
  const tree = Array.isArray(category.tree) ? category.tree : [];
  return tree.map((c) => (isObject(c) ? str(c.slug) : null)).filter((s) => s !== null);
}

export function productName(p: Json): string | null {
  return isObject(p.localizedName) ? str(p.localizedName.finnish) : str(p.localizedName);
}

export function normalPricing(p: Json): Json | null {
  const normal = pricing(p).normal;
  return isObject(normal) ? normal : null;
}

/** "0,89 €/l", the way the shelf label and the site show it. */
export function formatUnitPrice(normal: Json | null): string | null {
  const unitPrice = normal && isObject(normal.unitPrice) ? normal.unitPrice : null;
  const value = unitPrice ? num(unitPrice.value) : null;
  const unit = unitPrice ? str(unitPrice.unit) : null;
  return value !== null && unit ? `${fiDecimal(value, 2)} €/${unit}` : null;
}

export function toQueueItem(product: Json): QueueItem | null {
  const ean = str(product.ean);
  if (!ean) return null;
  const attributes = isObject(product.productAttributes) ? product.productAttributes : {};
  const category = categoryOf(product);
  const normal = normalPricing(product);
  return {
    ean,
    name: productName(product),
    brand: isObject(product.brand) ? str(product.brand.name) : null,
    price: normal ? num(normal.price) : null,
    unitPrice: formatUnitPrice(normal),
    slug: str(attributes.urlSlug),
    popularity: num(product.popularity) ?? 0,
    categoryPath: str(category.path),
  };
}

/**
 * The records in products.ndjson. A run killed mid-write can leave a half-written last
 * line; it is counted as damaged and skipped, so that product is simply fetched again.
 */
export function parseRecords(text: string): { records: Json[]; damaged: number } {
  const records: Json[] = [];
  let damaged = 0;
  for (const line of text.split('\n')) {
    try {
      const record: unknown = JSON.parse(line);
      if (isObject(record)) records.push(record);
    } catch {
      if (line.trim()) damaged++;
    }
  }
  return { records, damaged };
}

/**
 * 1 = most popular. Ties share a rank and the next rank skips (1, 2, 2, 4), so products
 * K-Ruoka scores 0 all share the last rank. Uses the listing's score, which every product
 * has, so all ranks come from the same source.
 */
export function popularityRanks(items: QueueItem[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.popularity - a.popularity);
  const ranks = new Map<string, number>();
  sorted.forEach((item, i) => {
    const previous = sorted[i - 1];
    const rank =
      previous && previous.popularity === item.popularity
        ? (ranks.get(previous.ean) ?? i + 1)
        : i + 1;
    ranks.set(item.ean, rank);
  });
  return ranks;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
