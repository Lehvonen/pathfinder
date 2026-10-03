/*
 * The hand-maintained department table, data/curation/departments.json
 * (docs/plans/normalise.md §5). Pure: the CLI reads and writes the file.
 *
 * A department the table has not seen gets a guessed row marked `reviewed: false`. The
 * guess is only a starting point: a person checks every row, because K-Ruoka's names are
 * internal labels ("KORVAA ITSE", "JÄTÄ SUORAAN PUUTTEEKSI!") and no pattern sorts them
 * reliably. The CLI refuses to write output while any row is unreviewed.
 */
import type { Temperature } from './categories';
import type { DepartmentKind } from './clean';
import type { RawDepartment, RawProduct } from './load';

export interface CuratedDepartment {
  id: string;
  name: string; // K-Ruoka's name, refreshed from each scrape, for whoever reviews the row
  kind: DepartmentKind;
  temperature: Temperature;
  label?: string; // signage-style name, for departments whose K-Ruoka name is internal
  reviewed?: false; // present only until a person has checked the row
}

export interface Reconciled {
  table: CuratedDepartment[]; // sorted by id
  added: string[]; // ids new in this scrape
  unreviewed: string[]; // ids still marked reviewed: false, new or not
  unused: string[]; // ids in the table but not in this scrape; kept, not deleted
}

/** Every department that at least one product is located in, keyed on id. */
export function departmentsSeen(products: RawProduct[]): Map<string, RawDepartment> {
  const seen = new Map<string, RawDepartment>();
  for (const product of products) {
    const department = product.location?.department;
    if (department?.id) seen.set(department.id, department);
  }
  return seen;
}

const BACKROOM = /JÄTÄ SUORAAN PUUTTEEKSI|takaa kerättävät|Kerääjä päivittää/i;
const JUNK = /toimituskoodit/i;
const COUNTER = /PTISKI|tiski/i;
const FROZEN = /pakaste/i;
const CHILLED = /MAITO|JUUSTO|kylmä|Lihat|tiski/i;

/** A first guess from the department's name and zone. */
export function guessDepartment(department: RawDepartment): CuratedDepartment {
  const name = department.name ?? '';
  const text = `${name} ${department.zone ?? ''}`;
  const kind: DepartmentKind = BACKROOM.test(name)
    ? 'backroom'
    : JUNK.test(name)
      ? 'junk'
      : COUNTER.test(name)
        ? 'counter'
        : 'aisle';
  const temperature: Temperature = FROZEN.test(text)
    ? 'frozen'
    : CHILLED.test(text)
      ? 'chilled'
      : 'ambient';
  return { id: department.id ?? '', name, kind, temperature, reviewed: false };
}

const byId = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id, 'en', { numeric: true });

/**
 * Merges the scrape into the table. Existing rows keep every decision a person made; only
 * their `name` is refreshed. New departments get a guessed, unreviewed row.
 */
export function reconcile(
  table: CuratedDepartment[],
  seen: ReadonlyMap<string, RawDepartment>,
): Reconciled {
  const existing = new Map(table.map((row) => [row.id, row]));
  const rows: CuratedDepartment[] = [];
  const added: string[] = [];
  for (const [id, department] of seen) {
    const row = existing.get(id);
    if (row) {
      rows.push({ ...row, name: department.name ?? row.name });
    } else {
      rows.push(guessDepartment(department));
      added.push(id);
    }
  }
  const unused = table.filter((row) => !seen.has(row.id));
  const all = [...rows, ...unused].sort(byId);
  return {
    table: all,
    added: added.sort((a, b) => byId({ id: a }, { id: b })),
    unreviewed: all.filter((row) => row.reviewed === false).map((row) => row.id),
    unused: unused.map((row) => row.id),
  };
}

/** The lookups clean.ts and categories.ts take. */
export function departmentLookups(table: CuratedDepartment[]): {
  kinds: Map<string, DepartmentKind>;
  temperatures: Map<string, Temperature>;
} {
  return {
    kinds: new Map(table.map((row) => [row.id, row.kind])),
    temperatures: new Map(table.map((row) => [row.id, row.temperature])),
  };
}
