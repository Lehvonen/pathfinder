/*
 * Shared test fixtures for the normalise tests: one real product, Pirkka milk at
 * K-Citymarket Kupittaa, and helpers that vary it. load.test.ts keeps its own fixtures,
 * because it works on raw JSON records, a different shape.
 */
import type { CleanProduct } from './clean';
import type { RawDepartment, RawLocation, RawProduct } from './load';

export const MILK_DEPARTMENT_ID = '91208';

export const milkDepartment: RawDepartment = {
  id: MILK_DEPARTMENT_ID,
  name: '(MAITO) Maidot ja piimät - KORVAA ITSE',
  orderNumber: 68,
  zone: 'KERÄILY',
  isPublic: false,
};

export const milkLocation: RawLocation = { shelf: '05', level: '1', department: milkDepartment };

export const milk: RawProduct = {
  ean: '6410405082657',
  name: 'Pirkka suomalainen kevytmaito 1l',
  brand: 'Pirkka',
  categoryPath: 'maito-juusto-munat-ja-rasvat/maidot-ja-piimat/maidot',
  popularity: 22234.8,
  isAvailable: true,
  location: milkLocation,
};

/** A copy of milk with another EAN and any fields overridden. */
export function product(ean: string, overrides: Partial<RawProduct> = {}): RawProduct {
  return { ...milk, ean, ...overrides };
}

/** Milk's shelf and level, in the given department (or none). */
export function locatedIn(department: RawDepartment | null): RawLocation {
  return { ...milkLocation, department };
}

/** Milk's location, moved to another department id. */
export function inDepartment(id: string): RawLocation {
  return locatedIn({ ...milkDepartment, id });
}

export function department(id: string, name: string, zone = 'KERÄILY'): RawDepartment {
  return { id, name, orderNumber: 1, zone, isPublic: true };
}

/** A clean product in milk's department unless overridden; its name is its EAN. */
export function cleanProduct(ean: string, overrides: Partial<CleanProduct> = {}): CleanProduct {
  const departmentId = overrides.departmentId ?? MILK_DEPARTMENT_ID;
  return {
    ean,
    name: ean,
    categoryPath: null,
    popularity: null,
    departmentId,
    shelfId: `${departmentId}:01`,
    ...overrides,
  };
}
