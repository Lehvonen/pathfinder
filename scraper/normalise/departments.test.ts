import { describe, expect, it } from 'vitest';
import {
  departmentLookups,
  departmentsSeen,
  guessDepartment,
  reconcile,
  type CuratedDepartment,
} from './departments';
import { department, locatedIn, MILK_DEPARTMENT_ID, milkDepartment, product } from './fixtures';
import type { RawDepartment } from './load';

/** A product located in the given department, or in none. */
const located = (ean: string, dept: RawDepartment | null) =>
  product(ean, { location: locatedIn(dept) });

const dairy = milkDepartment;
const coffee = department('536', '(TEOLLINEN 12) Kahvit');

describe('departmentsSeen', () => {
  it('collects each department once, skipping products without one', () => {
    const seen = departmentsSeen([
      located('1', dairy),
      located('2', dairy),
      located('3', coffee),
      located('4', null),
      product('5', { location: null }),
      located('6', { ...coffee, id: null }),
    ]);
    expect([...seen.keys()]).toEqual(['91208', '536']);
  });
});

describe('guessDepartment', () => {
  it.each([
    ['(TEOLLINEN 12) Kahvit', 'KERÄILY', 'aisle', 'ambient'],
    ['(MAITO) Maidot ja piimät - KORVAA ITSE', 'KERÄILY', 'aisle', 'chilled'],
    ['(HEVI) Kylmähylly - Luomutuotteet', 'KERÄILY', 'aisle', 'chilled'],
    ['(KYLMÄ-E) Lihapakastekaapit', 'Pakaste Eläin (VV)', 'aisle', 'frozen'],
    ['(PAKASTE) Pizzakaapit', 'Pakaste (VV)', 'aisle', 'frozen'],
    ['PTISKI - Kalatiski', 'PALVELUTISKI', 'counter', 'chilled'],
    ['(JUUSTO) Juustotiski', 'Juustotiski (VV)', 'counter', 'chilled'],
    ['Il Mulino - JÄTÄ SUORAAN PUUTTEEKSI!', 'KERÄILY', 'backroom', 'ambient'],
    ['V2 takaa kerättävät', 'YÖ KERÄILY Maidot (VV)', 'backroom', 'ambient'],
    ['Keräys- ja toimituskoodit', '', 'junk', 'ambient'],
    ['Kaupan sisääntulot', 'KT Tarraton', 'aisle', 'ambient'],
  ])('guesses %s (%s) as %s, %s', (name, zone, kind, temperature) => {
    expect(guessDepartment('1', department('1', name, zone))).toEqual({
      id: '1',
      name,
      kind,
      temperature,
      reviewed: false,
    });
  });

  it('takes the id from the argument, not from the scraped department', () => {
    expect(guessDepartment('536', { ...coffee, id: null }).id).toBe('536');
  });

  it('copes with a department missing its name and zone', () => {
    const guess = guessDepartment('1', { ...department('1', ''), name: null, zone: null });
    expect(guess).toMatchObject({ name: '', kind: 'aisle', temperature: 'ambient' });
  });
});

describe('reconcile', () => {
  const reviewedMilk: CuratedDepartment = {
    id: '91208',
    name: 'old name',
    kind: 'aisle',
    temperature: 'chilled',
    label: 'Maidot',
  };

  it('keeps human decisions and refreshes only the name', () => {
    const edited = { ...reviewedMilk, temperature: 'ambient' as const };
    const { table, added, unreviewed } = reconcile(
      [edited],
      new Map([[MILK_DEPARTMENT_ID, dairy]]),
    );
    expect(table).toEqual([{ ...edited, name: dairy.name }]);
    expect(added).toEqual([]);
    expect(unreviewed).toEqual([]);
  });

  it('keeps the old name when the scrape has none', () => {
    const { table } = reconcile(
      [reviewedMilk],
      new Map([[MILK_DEPARTMENT_ID, { ...dairy, name: null }]]),
    );
    expect(table[0]?.name).toBe('old name');
  });

  it('adds a guessed, unreviewed row for a new department', () => {
    const { table, added, unreviewed } = reconcile(
      [reviewedMilk],
      new Map([
        [MILK_DEPARTMENT_ID, dairy],
        ['536', coffee],
      ]),
    );
    expect(added).toEqual(['536']);
    expect(unreviewed).toEqual(['536']);
    expect(table.find((row) => row.id === '536')).toEqual(guessDepartment('536', coffee));
  });

  it('reports rows still unreviewed from an earlier run', () => {
    const pending = guessDepartment('536', coffee);
    const { added, unreviewed } = reconcile([pending], new Map([['536', coffee]]));
    expect(added).toEqual([]);
    expect(unreviewed).toEqual(['536']);
  });

  it('keeps departments missing from the scrape and reports them as unused', () => {
    const { table, unused } = reconcile([reviewedMilk], new Map([['536', coffee]]));
    expect(table.map((row) => row.id)).toEqual(['536', '91208']);
    expect(unused).toEqual(['91208']);
  });

  it('sorts rows by numeric id', () => {
    const seen = new Map(['91208', '600', '55456'].map((id) => [id, department(id, id)]));
    expect(reconcile([], seen).table.map((row) => row.id)).toEqual(['600', '55456', '91208']);
  });
});

describe('departmentLookups', () => {
  it('maps ids to kinds and temperatures', () => {
    const counter: CuratedDepartment = {
      id: '90547',
      name: 'PTISKI - Kalatiski',
      kind: 'counter',
      temperature: 'chilled',
    };
    const { kinds, temperatures } = departmentLookups([counter]);
    expect(kinds).toEqual(new Map([['90547', 'counter']]));
    expect(temperatures).toEqual(new Map([['90547', 'chilled']]));
  });
});
