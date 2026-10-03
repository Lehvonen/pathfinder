/*
 * The cleaning rules (docs/plans/normalise.md §4, rules 2–7 and 10). Pure: raw products in,
 * clean products plus a reason for every product left out.
 *
 * The output is not yet the contract's Product: categoryId is assigned later from
 * categoryPath, by categories.ts.
 */
import type { RawProduct } from './load';

/** From the hand-maintained department table (plan §5). */
export type DepartmentKind = 'aisle' | 'counter' | 'backroom' | 'junk';

export type ExclusionReason =
  'bad-ean' | 'no-name' | 'no-location' | 'unavailable' | 'junk-department' | 'backroom-department';

export interface Exclusion {
  ean: string;
  reason: ExclusionReason;
}

export interface CleanProduct {
  ean: string;
  name: string;
  brand?: string;
  categoryPath: string | null;
  popularity: number | null; // 0 means unranked, not a tie (ARCHITECTURE.md §6)
  departmentId: string;
  shelfId: string;
  shelfLevel?: number;
}

/** Shelf `00` means the store records the department but no shelf. */
export const DEPARTMENT_WIDE_SHELF = '00';

const EAN = /^(\d{8}|\d{12,14})$/;

export const isValidEan = (ean: string): boolean => EAN.test(ean);

/** Trims and collapses runs of whitespace; empty becomes undefined. */
export function cleanText(text: string | null): string | undefined {
  const cleaned = text?.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned : undefined;
}

/**
 * `<departmentId>:<shelf>`. Shelf numbers repeat in every department, so the number alone
 * is not an ID. A missing shelf counts as department-wide.
 */
export function shelfId(departmentId: string, shelf: string | null): string {
  return `${departmentId}:${cleanText(shelf) ?? DEPARTMENT_WIDE_SHELF}`;
}

/** Level 0, a non-number, or any level on a department-wide shelf means unknown. */
export function shelfLevel(shelf: string | null, level: string | null): number | undefined {
  if ((cleanText(shelf) ?? DEPARTMENT_WIDE_SHELF) === DEPARTMENT_WIDE_SHELF) return undefined;
  const n = Number(level);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function exclusionReason(
  product: RawProduct,
  departmentKinds: ReadonlyMap<string, DepartmentKind>,
): ExclusionReason | null {
  if (!isValidEan(product.ean)) return 'bad-ean';
  if (!cleanText(product.name)) return 'no-name';
  const departmentId = product.location?.department?.id;
  if (!departmentId) return 'no-location';
  if (product.isAvailable === false) return 'unavailable';
  const kind = departmentKinds.get(departmentId);
  if (kind === 'junk') return 'junk-department';
  if (kind === 'backroom') return 'backroom-department';
  return null;
}

/**
 * Cleans every product, sorted by EAN. A department missing from `departmentKinds` is
 * kept: the department table reports unreviewed rows itself.
 */
export function cleanProducts(
  products: RawProduct[],
  departmentKinds: ReadonlyMap<string, DepartmentKind>,
): { products: CleanProduct[]; exclusions: Exclusion[] } {
  const clean: CleanProduct[] = [];
  const exclusions: Exclusion[] = [];
  for (const product of [...products].sort((a, b) => a.ean.localeCompare(b.ean))) {
    const reason = exclusionReason(product, departmentKinds);
    if (reason) {
      exclusions.push({ ean: product.ean, reason });
      continue;
    }
    // exclusionReason has checked both
    const location = product.location!;
    const departmentId = location.department!.id!;
    const brand = cleanText(product.brand);
    const level = shelfLevel(location.shelf, location.level);
    clean.push({
      ean: product.ean,
      name: cleanText(product.name)!,
      ...(brand && { brand }),
      categoryPath: product.categoryPath,
      popularity: product.popularity > 0 ? product.popularity : null,
      departmentId,
      shelfId: shelfId(departmentId, location.shelf),
      ...(level !== undefined && { shelfLevel: level }),
    });
  }
  return { products: clean, exclusions };
}
