import type { Category, Graph, Placement, Product } from '@pathfinder/core';
import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { CuratedDepartment } from './departments';
import {
  categoryIdsSchema,
  categoryNamesSchema,
  categoryOverridesSchema,
  categorySchema,
  curatedDepartmentsSchema,
  graphSchema,
  mapAreasSchema,
  placementSchema,
  popularitySchema,
  productSchema,
  validateDepartmentAreas,
  validateGraph,
  validateMapAreas,
  validateNormalised,
  type DepartmentSeen,
  type NormalisedData,
} from './schema';

/** A committed data file, read from the repo root. */
function readData(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

describe('schema types', () => {
  // Checked by the typecheck: a change to types.ts or departments.ts that a schema does
  // not follow, in either direction, fails to compile
  it('equal the contract types they mirror', () => {
    expectTypeOf<z.infer<typeof productSchema>>().toEqualTypeOf<Product>();
    expectTypeOf<z.infer<typeof placementSchema>>().toEqualTypeOf<Placement>();
    expectTypeOf<z.infer<typeof categorySchema>>().toEqualTypeOf<Category>();
    expectTypeOf<z.infer<typeof curatedDepartmentsSchema>>().toEqualTypeOf<CuratedDepartment[]>();
    expectTypeOf<z.infer<typeof graphSchema>>().toEqualTypeOf<Graph>();
  });
});

describe('curation schemas', () => {
  const row = { id: '91208', name: '(MAITO) Maidot', kind: 'aisle', temperature: 'chilled' };

  it('accept valid department rows, reviewed or not', () => {
    const rows = [row, { ...row, id: '600', label: 'Jäätelöt', reviewed: false }];
    expect(curatedDepartmentsSchema.safeParse(rows).success).toBe(true);
  });

  it.each([
    ['a typo in kind', { ...row, kind: 'junkk' }],
    ['an unknown temperature', { ...row, temperature: 'warm' }],
    ['reviewed: true', { ...row, reviewed: true }],
    ['an unknown field', { ...row, kinds: 'aisle' }],
    ['an empty id', { ...row, id: '' }],
  ])('reject a department row with %s', (_, bad) => {
    expect(curatedDepartmentsSchema.safeParse([bad]).success).toBe(false);
  });

  it('check overrides and names', () => {
    expect(categoryOverridesSchema.safeParse({ 'a/b': 'frozen' }).success).toBe(true);
    expect(categoryOverridesSchema.safeParse({ 'a/b': 'cold' }).success).toBe(false);
    expect(categoryNamesSchema.safeParse({ a: 'Maidot' }).success).toBe(true);
    expect(categoryNamesSchema.safeParse({ a: '' }).success).toBe(false);
    expect(categoryIdsSchema.safeParse({ a: 1, 'a/b': 2 }).success).toBe(true);
    expect(categoryIdsSchema.safeParse({ a: 0 }).success).toBe(false);
  });
});

describe('validateMapAreas', () => {
  const square = {
    id: 'kukat',
    label: 'Kukat',
    kind: 'goods',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
  };
  const door = { id: 'sisäänkäynti-1', point: [10, 2] };
  const file = (areas: unknown[], entrances: unknown[] = [door]) => ({
    version: 1,
    source: 'https://example.com/map.svg',
    metresPerSourceUnit: 0.22,
    entrances,
    areas,
  });

  it('accepts valid areas, labelled or not, with å, ä and ö kept in the id', () => {
    const unlabelled = { id: 'nimetön', kind: 'goods', polygon: square.polygon };
    const lettersKept = { ...square, id: 'keittiö-åland' };
    expect(validateMapAreas(file([square, unlabelled, lettersKept]))).toEqual([]);
  });

  it.each([
    ['an id that is not kebab-case', { ...square, id: 'Kukat' }],
    ['an id with a letter other than å, ä or ö outside a-z', { ...square, id: 'café' }],
    ['an unknown kind', { ...square, kind: 'shop' }],
    [
      'a negative coordinate',
      {
        ...square,
        polygon: [
          [-1, 0],
          [4, 0],
          [4, 4],
        ],
      },
    ],
    [
      'fewer than three points',
      {
        ...square,
        polygon: [
          [0, 0],
          [4, 4],
        ],
      },
    ],
    ['an unknown field', { ...square, colour: 'black' }],
  ])('rejects an area with %s', (_, bad) => {
    expect(validateMapAreas(file([bad]))).not.toEqual([]);
  });

  it.each([
    ['no entrances', []],
    ['an entrance at a negative coordinate', [{ ...door, point: [-1, 2] }]],
    ['an entrance with an id that is not kebab-case', [{ ...door, id: 'Ovi 1' }]],
  ])('rejects a map with %s', (_, entrances) => {
    expect(validateMapAreas(file([square], entrances))).not.toEqual([]);
  });

  it('rejects an entrance with the same id as an area', () => {
    expect(validateMapAreas(file([square], [{ ...door, id: 'kukat' }]))).toEqual([
      'area kukat: duplicate id',
    ]);
  });

  it('rejects a duplicate id and a polygon with no area', () => {
    const flat = {
      ...square,
      id: 'viiva',
      polygon: [
        [0, 0],
        [2, 2],
        [4, 4],
      ],
    };
    expect(validateMapAreas(file([square, square, flat]))).toEqual([
      'area kukat: duplicate id',
      'area viiva: polygon has no area',
    ]);
  });

  it('accepts the committed data/graph/areas.json', () => {
    expect(validateMapAreas(readData('data/graph/areas.json'))).toEqual([]);
  });
});

describe('validateDepartmentAreas', () => {
  const areaIds = new Set(['maitokaappi', 'leipä']);
  const milk = { id: '91208', name: '(MAITO) Maidot', products: 99 };
  const bread = { id: '613', name: '(LEIPÄ) Leipähyllykalusteet', products: 315 };
  const milkRow = { department: '91208', area: 'maitokaappi', name: milk.name };
  const breadRow = { department: '613', area: 'leipä', name: bread.name, reviewed: false };

  it('accepts a row for every department with products, reviewed or not', () => {
    expect(validateDepartmentAreas([milkRow, breadRow], [milk, bread], areaIds)).toEqual([]);
  });

  it('does not need a row for a department with no products', () => {
    const empty = { ...bread, products: 0 };
    expect(validateDepartmentAreas([milkRow], [milk, empty], areaIds)).toEqual([]);
  });

  it.each([
    ['reviewed: true', { ...milkRow, reviewed: true }],
    ['an area id that is not kebab-case', { ...milkRow, area: 'Maitokaappi' }],
    ['an unknown field', { ...milkRow, shelf: '05' }],
    ['no department', { ...milkRow, department: '' }],
  ])('rejects a row with %s', (_, bad) => {
    expect(validateDepartmentAreas([bad], [milk], areaIds)).not.toEqual([]);
  });

  it('names a department with products but no row, so its products are never dropped', () => {
    expect(validateDepartmentAreas([milkRow], [milk, bread], areaIds)).toEqual([
      'department 613 ((LEIPÄ) Leipähyllykalusteet): no area for its 315 products',
    ]);
  });

  it('rejects a duplicate row, an unknown department and an unknown area', () => {
    const ghost = { ...milkRow, department: '1' };
    const lost = { ...breadRow, area: 'kahvila' };
    expect(
      validateDepartmentAreas([milkRow, milkRow, ghost, lost], [milk, bread], areaIds),
    ).toEqual([
      'department 91208: duplicate row',
      'department 1: no such department',
      'department 613: no such area kahvila',
    ]);
  });

  it('accepts the committed data/curation/department-areas.json', () => {
    const map = mapAreasSchema.parse(readData('data/graph/areas.json'));
    const departments = readData('data/normalised/departments.json') as DepartmentSeen[];
    const rows = readData('data/curation/department-areas.json');
    const areaIds = new Set(map.areas.map((area) => area.id));
    expect(validateDepartmentAreas(rows, departments, areaIds)).toEqual([]);
  });
});

describe('validateGraph', () => {
  const milk = { id: '91208', name: '(MAITO) Maidot', products: 99 };
  const square = [
    [0, 0],
    [4, 0],
    [4, 4],
  ];
  const graph = () => ({
    note: 'Rough first draft.',
    version: 1,
    nodes: [
      { id: 'sisäänkäynti-1:0', x: 10, y: 0, kind: 'entrance' },
      { id: 'käytävä:1', x: 5, y: 0, kind: 'junction' },
      { id: 'maitokaappi:0', x: 5, y: 3, kind: 'shelf-access' },
      { id: 'kassat-1:0', x: 8, y: 3, kind: 'checkout' },
    ],
    edges: [
      { from: 'sisäänkäynti-1:0', to: 'käytävä:1', weight: 5 },
      { from: 'käytävä:1', to: 'maitokaappi:0', weight: 3 },
      { from: 'käytävä:1', to: 'kassat-1:0', weight: 4.2 },
    ],
    shelves: [{ id: '91208:00', accessNodeId: 'maitokaappi:0', polygon: square }],
  });

  it('accepts a connected graph with a department-wide shelf for every department', () => {
    expect(validateGraph(graph(), [milk, { ...milk, id: '1', products: 0 }])).toEqual([]);
  });

  it.each([
    ['no note', { ...graph(), note: undefined }],
    ['a field outside the contract', { ...graph(), scale: 0.22 }],
    ['a zero weight', { ...graph(), edges: [{ ...graph().edges[0], weight: 0 }] }],
    ['an unknown node kind', { ...graph(), nodes: [{ ...graph().nodes[0], kind: 'door' }] }],
    [
      'a shelf id that is not <departmentId>:<shelf>',
      { ...graph(), shelves: [{ ...graph().shelves[0], id: '91208' }] },
    ],
  ])('rejects a graph with %s', (_, bad) => {
    expect(validateGraph(bad, [milk])).not.toEqual([]);
  });

  it('rejects broken references, duplicates and a missing entrance or checkout', () => {
    const g = graph();
    g.nodes = [...g.nodes.filter((node) => node.kind !== 'checkout'), g.nodes[1]!];
    g.edges = [...g.edges, { from: 'käytävä:1', to: 'sisäänkäynti-1:0', weight: 5 }];
    g.shelves = [...g.shelves, { id: '91208:00', accessNodeId: 'kala:0', polygon: square }];
    expect(validateGraph(g, [milk])).toEqual([
      'node käytävä:1: duplicate id',
      'edge käytävä:1 → kassat-1:0: no such node kassat-1:0',
      'edge käytävä:1 → sisäänkäynti-1:0: duplicate edge',
      'shelf 91208:00: duplicate id',
      'shelf 91208:00: no such node kala:0',
      'graph: no checkout node',
    ]);
  });

  it('rejects a node that cannot be reached from the entrance', () => {
    const g = graph();
    g.edges = g.edges.filter((edge) => edge.to !== 'kassat-1:0');
    expect(validateGraph(g, [milk])).toEqual([
      'graph: 1 nodes unreachable from sisäänkäynti-1:0: kassat-1:0',
    ]);
  });

  it('names a department with products but no department-wide shelf', () => {
    const bread = { id: '613', name: '(LEIPÄ) Leipähyllykalusteet', products: 315 };
    expect(validateGraph(graph(), [milk, bread])).toEqual([
      'department 613 ((LEIPÄ) Leipähyllykalusteet): no shelf 613:00 for its 315 products',
    ]);
  });

  it('accepts the committed data/graph/department-level.json', () => {
    const departments = readData('data/normalised/departments.json') as DepartmentSeen[];
    expect(validateGraph(readData('data/graph/department-level.json'), departments)).toEqual([]);
  });
});

const MILK = '6410405082657';
const BREAD = '6410405000001';

function valid(): NormalisedData {
  return {
    products: [
      { ean: MILK, name: 'Pirkka suomalainen kevytmaito 1l', brand: 'Pirkka', categoryId: 2 },
      { ean: BREAD, name: 'Ruisleipä', categoryId: 2 },
    ],
    placements: [
      { ean: MILK, shelfId: '91208:05', shelfLevel: 1, isPrimary: true },
      { ean: BREAD, shelfId: '613:00', isPrimary: true },
      { ean: MILK, shelfId: '55488:02', isPrimary: false },
    ],
    categories: [
      { id: 1, name: 'Maito, juusto, munat ja rasvat', temperature: 'chilled' },
      { id: 2, name: 'Maidot', temperature: 'chilled', parentId: 1 },
    ],
  };
}

describe('validateNormalised', () => {
  it('accepts valid data', () => {
    expect(validateNormalised(valid())).toEqual([]);
  });

  it('rejects fields outside the contract, such as price', () => {
    const data = valid();
    data.products[0] = { ...data.products[0]!, price: 0.89 } as never;
    expect(validateNormalised(data)).toEqual([
      expect.stringMatching(/^product 6410405082657: \(record\) Unrecognized key/),
    ]);
  });

  it('rejects malformed fields, naming the record and field', () => {
    const data = valid();
    data.products[1] = { ean: '123', name: '', categoryId: 0 } as never;
    data.placements[1] = { ean: BREAD, shelfId: '613', shelfLevel: 0, isPrimary: true };
    data.categories[0] = { id: 1, name: 'x', temperature: 'warm' } as never;
    const errors = validateNormalised(data);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^product 123: ean not an EAN/),
        expect.stringMatching(/^product 123: name /),
        expect.stringMatching(/^product 123: categoryId /),
        expect.stringMatching(/^placement 6410405000001: shelfId not <departmentId>:<shelf>/),
        expect.stringMatching(/^placement 6410405000001: shelfLevel /),
        expect.stringMatching(/^category 1: temperature /),
      ]),
    );
  });

  it('rejects a duplicate EAN', () => {
    const data = valid();
    data.products.push({ ...data.products[0]! });
    expect(validateNormalised(data)).toContain(`product ${MILK}: duplicate EAN`);
  });

  it('requires exactly one primary placement per product', () => {
    const none = valid();
    none.placements = none.placements.filter((p) => p.ean !== BREAD);
    expect(validateNormalised(none)).toEqual([
      `product ${BREAD}: 0 primary placements, expected 1`,
    ]);

    const two = valid();
    two.placements.push({ ean: BREAD, shelfId: '613:01', isPrimary: true });
    expect(validateNormalised(two)).toEqual([`product ${BREAD}: 2 primary placements, expected 1`]);
  });

  it('rejects a placement for a product that does not exist', () => {
    const data = valid();
    data.placements.push({ ean: '6410405000099', shelfId: '613:01', isPrimary: false });
    expect(validateNormalised(data)).toEqual(['placement 6410405000099: no such product']);
  });

  it('rejects references to categories that do not exist', () => {
    const data = valid();
    data.products[1] = { ...data.products[1]!, categoryId: 9 };
    data.categories[1] = { ...data.categories[1]!, parentId: 8 };
    expect(validateNormalised(data)).toEqual([
      'category 2: no such parent 8',
      `product ${BREAD}: no such category 9`,
    ]);
  });

  it('rejects a duplicate category id', () => {
    const data = valid();
    data.categories.push({ id: 2, name: 'Piimät', temperature: 'chilled', parentId: 1 });
    expect(validateNormalised(data)).toEqual(['category 2: duplicate id']);
  });

  it('names a record without a key by its position', () => {
    const data = valid();
    data.categories.push({} as never);
    expect(validateNormalised(data)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^category #2: /)]),
    );
  });

  it('reports a broken product once, not again in the cross-checks', () => {
    const data = valid();
    data.products[1] = { ean: BREAD, name: '', categoryId: 99 };
    expect(validateNormalised(data)).toEqual([
      expect.stringMatching(/^product 6410405000001: name /),
    ]);
  });
});

describe('popularitySchema', () => {
  it('accepts positive scores and null for unranked products', () => {
    expect(popularitySchema.safeParse({ [MILK]: 22234.8, [BREAD]: null }).success).toBe(true);
    expect(popularitySchema.safeParse({}).success).toBe(true);
  });

  it('rejects 0, which must be written as null, and other non-positive or non-numbers', () => {
    for (const score of [0, -1, '12', undefined]) {
      expect(popularitySchema.safeParse({ [MILK]: score }).success).toBe(false);
    }
  });

  it('rejects a key that is not an EAN', () => {
    expect(popularitySchema.safeParse({ 'not-an-ean': 5 }).success).toBe(false);
  });
});
