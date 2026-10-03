import { describe, expect, it } from 'vitest';
import { joinScrape, parseProducts, parseQueue } from './load';

const milk = {
  ean: '6410405082657',
  name: 'Pirkka suomalainen kevytmaito 1l',
  brand: 'Pirkka',
  categoryPath: 'maito-juusto-munat-ja-rasvat/maidot/kevytmaidot',
  popularity: 22234.8,
};

const milkRecord = {
  ean: milk.ean,
  name: milk.name,
  brand: null,
  storeId: 'N119',
  isAvailable: true,
  categoryPath: milk.categoryPath,
  location: {
    segment: '8417',
    shelf: '05',
    level: '1',
    department: {
      id: '91208',
      name: '(MAITO) Maidot ja piimät - KORVAA ITSE',
      orderNumber: 68,
      zone: 'KERÄILY',
      isPublic: false,
    },
  },
};

const ndjson = (...records: unknown[]) => records.map((r) => JSON.stringify(r)).join('\n') + '\n';

describe('parseQueue', () => {
  it('reads entries and defaults missing popularity to 0', () => {
    const queue = parseQueue(JSON.stringify([milk, { ean: '1', name: 'X' }]));
    expect(queue).toEqual([
      milk,
      { ean: '1', name: 'X', brand: null, categoryPath: null, popularity: 0 },
    ]);
  });

  it('skips entries without an EAN', () => {
    expect(parseQueue(JSON.stringify([{ name: 'no ean' }, null]))).toEqual([]);
  });

  it('rejects a queue that is not an array', () => {
    expect(() => parseQueue('{}')).toThrow('not an array');
  });
});

describe('parseProducts', () => {
  it('keeps location fields and drops segment', () => {
    const { records, issues } = parseProducts(ndjson(milkRecord));
    expect(issues).toEqual([]);
    expect(records[0]?.location).toEqual({
      shelf: '05',
      level: '1',
      department: milkRecord.location.department,
    });
  });

  it('keeps a location whose department is null', () => {
    const record = { ...milkRecord, location: { shelf: '00', level: '0', department: null } };
    expect(parseProducts(ndjson(record)).records[0]?.location?.department).toBeNull();
  });

  it('reports damaged lines and lines without an EAN, and carries on', () => {
    const text = ndjson(milkRecord) + '{"ean":"64104' + '\n' + ndjson({ name: 'no ean' });
    const { records, issues } = parseProducts(text);
    expect(records).toHaveLength(1);
    expect(issues).toEqual([
      { ean: null, reason: 'damaged-line' },
      { ean: null, reason: 'damaged-line' },
    ]);
  });
});

describe('joinScrape', () => {
  it('takes name, brand, category and popularity from the queue', () => {
    const { products } = joinScrape([milk], parseProducts(ndjson(milkRecord)).records);
    expect(products).toEqual([
      {
        ean: milk.ean,
        name: milk.name,
        brand: 'Pirkka', // null in the ndjson record
        categoryPath: milk.categoryPath,
        popularity: 22234.8,
        isAvailable: true,
        location: parseProducts(ndjson(milkRecord)).records[0]?.location,
      },
    ]);
  });

  it('falls back to the fetched record when the queue lacks a field', () => {
    const queue = [{ ean: milk.ean, name: null, brand: null, categoryPath: null, popularity: 0 }];
    const record = { ...milkRecord, brand: 'Valio' };
    const [product] = joinScrape(queue, parseProducts(ndjson(record)).records).products;
    expect(product).toMatchObject({
      name: milk.name,
      brand: 'Valio',
      categoryPath: milk.categoryPath,
    });
  });

  it('reports products queued but not fetched, and fetched but not queued', () => {
    const banana = { ...milk, ean: '2000818700008' };
    const stray = { ...milkRecord, ean: '9999999999999' };
    const { products, issues } = joinScrape(
      [milk, banana],
      parseProducts(ndjson(milkRecord, stray)).records,
    );
    expect(products.map((p) => p.ean)).toEqual([milk.ean]);
    expect(issues).toEqual([
      { ean: banana.ean, reason: 'not-fetched' },
      { ean: stray.ean, reason: 'not-queued' },
    ]);
  });

  it('keeps the last of repeated records and reports the repeat', () => {
    const first = { ...milkRecord, isAvailable: false };
    const { products, issues } = joinScrape(
      [milk],
      parseProducts(ndjson(first, milkRecord)).records,
    );
    expect(products[0]?.isAvailable).toBe(true);
    expect(issues).toEqual([{ ean: milk.ean, reason: 'duplicate-record' }]);
  });
});
