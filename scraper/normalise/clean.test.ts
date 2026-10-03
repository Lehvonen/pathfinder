import { describe, expect, it } from 'vitest';
import {
  cleanProducts,
  cleanText,
  isValidEan,
  shelfId,
  shelfLevel,
  type DepartmentKind,
} from './clean';
import { inDepartment, milk, milkLocation, product } from './fixtures';

const noKinds = new Map<string, DepartmentKind>();

describe('isValidEan', () => {
  it.each(['12345678', '012345678905', '6410405082657', '16410405082654'])('accepts %s', (ean) => {
    expect(isValidEan(ean)).toBe(true);
  });

  it.each([
    '',
    '1234567',
    '123456789',
    '1234567890',
    '12345678901', // a UPC-A without its check digit, just below 12
    '641040508265X',
    '123456789012345',
  ])('rejects "%s"', (ean) => {
    expect(isValidEan(ean)).toBe(false);
  });
});

describe('cleanText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanText('  Pirkka  laktoositon\tkermaviili 200g ')).toBe(
      'Pirkka laktoositon kermaviili 200g',
    );
  });

  it.each([null, '', '   '])('turns %j into undefined', (text) => {
    expect(cleanText(text)).toBeUndefined();
  });
});

describe('shelfId', () => {
  it('prefixes the shelf with its department', () => {
    expect(shelfId('91208', '05')).toBe('91208:05');
  });

  it('treats a missing shelf as department-wide', () => {
    expect(shelfId('91208', null)).toBe('91208:00');
    expect(shelfId('91208', ' ')).toBe('91208:00');
  });
});

describe('shelfLevel', () => {
  it('parses a level on a real shelf', () => {
    expect(shelfLevel('05', '3')).toBe(3);
  });

  it.each([
    ['05', '0'],
    ['05', null],
    ['05', 'x'],
    ['00', '4'], // a level means nothing without a shelf
    [null, '2'],
  ])('is undefined for shelf %j, level %j', (shelf, level) => {
    expect(shelfLevel(shelf, level)).toBeUndefined();
  });
});

describe('cleanProducts', () => {
  it('returns nothing for no products', () => {
    expect(cleanProducts([], noKinds)).toEqual({ products: [], exclusions: [] });
  });

  it('gives a department-only product the department-wide shelf and no level', () => {
    const [clean] = cleanProducts(
      [product('6410405000003', { location: { ...milkLocation, shelf: '00', level: '4' } })],
      noKinds,
    ).products;
    expect(clean?.shelfId).toBe('91208:00');
    expect(clean).not.toHaveProperty('shelfLevel');
  });

  it('cleans a product into the intermediate shape', () => {
    const messy = { ...milk, name: 'Pirkka  suomalainen kevytmaito 1l ' };
    expect(cleanProducts([messy], noKinds)).toEqual({
      products: [
        {
          ean: '6410405082657',
          name: 'Pirkka suomalainen kevytmaito 1l',
          brand: 'Pirkka',
          categoryPath: milk.categoryPath,
          popularity: 22234.8,
          departmentId: '91208',
          shelfId: '91208:05',
          shelfLevel: 1,
        },
      ],
      exclusions: [],
    });
  });

  it('leaves out brand and shelfLevel when unknown, and maps popularity 0 to null', () => {
    const [clean] = cleanProducts(
      [
        product('6410405000002', {
          brand: ' ',
          popularity: 0,
          location: { ...milkLocation, level: '0' },
        }),
      ],
      noKinds,
    ).products;
    expect(clean).not.toHaveProperty('brand');
    expect(clean).not.toHaveProperty('shelfLevel');
    expect(clean?.popularity).toBeNull();
  });

  it('gives every left-out product a reason', () => {
    const kinds = new Map<string, DepartmentKind>([
      ['585', 'junk'],
      ['64575', 'backroom'],
    ]);
    const { products, exclusions } = cleanProducts(
      [
        product('123'),
        product('6410405000001', { name: '  ' }),
        product('6410405000002', { location: null }),
        product('6410405000003', { location: { shelf: '00', level: '0', department: null } }),
        product('6410405000004', { isAvailable: false }),
        product('6410405000005', { location: inDepartment('585') }),
        product('6410405000006', { location: inDepartment('64575') }),
      ],
      kinds,
    );
    expect(products).toEqual([]);
    expect(exclusions).toEqual([
      { ean: '123', reason: 'bad-ean' },
      { ean: '6410405000001', reason: 'no-name' },
      { ean: '6410405000002', reason: 'no-location' },
      { ean: '6410405000003', reason: 'no-location' },
      { ean: '6410405000004', reason: 'unavailable' },
      { ean: '6410405000005', reason: 'junk-department' },
      { ean: '6410405000006', reason: 'backroom-department' },
    ]);
  });

  it('reports only the first reason that applies', () => {
    const { exclusions } = cleanProducts(
      [product('123', { name: null, location: null, isAvailable: false })],
      noKinds,
    );
    expect(exclusions).toEqual([{ ean: '123', reason: 'bad-ean' }]);
  });

  it('keeps products of aisle, counter and unlisted departments, and unknown availability', () => {
    const kinds = new Map<string, DepartmentKind>([
      ['91208', 'aisle'],
      ['90548', 'counter'],
    ]);
    const { products } = cleanProducts(
      [
        product('6410405000001'),
        product('6410405000002', { location: inDepartment('90548') }),
        product('6410405000003', { location: inDepartment('1'), isAvailable: null }),
      ],
      kinds,
    );
    expect(products.map((p) => p.shelfId)).toEqual(['91208:05', '90548:05', '1:05']);
  });

  it('sorts output by EAN without changing the input', () => {
    const input = [product('6410405000002'), product('6410405000001')];
    const { products } = cleanProducts(input, noKinds);
    expect(products.map((p) => p.ean)).toEqual(['6410405000001', '6410405000002']);
    expect(input.map((p) => p.ean)).toEqual(['6410405000002', '6410405000001']);
  });
});
