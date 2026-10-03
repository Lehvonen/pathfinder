import { describe, expect, it } from 'vitest';
import type { CleanProduct } from './clean';
import { LIST_LIMIT, renderReport, sample, type ReportInput } from './report';

function product(ean: string, shelfId: string): CleanProduct {
  return {
    ean,
    name: ean,
    categoryPath: null,
    popularity: null,
    departmentId: shelfId.split(':')[0]!,
    shelfId,
  };
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    scrapedAt: '2026-10-03',
    queued: 5,
    products: [
      product('1', '91208:05'),
      product('2', '91208:00'),
      product('3', '91208:06'),
      product('4', '600:00'),
    ],
    loadIssues: [],
    exclusions: [{ ean: '5', reason: 'no-location' }],
    departments: {
      table: [
        { id: '600', name: '(PAKASTE) Jäätelökaapit', kind: 'aisle', temperature: 'frozen' },
        { id: '91208', name: '(MAITO) Maidot ja piimät', kind: 'aisle', temperature: 'chilled' },
      ],
      added: [],
      unreviewed: [],
      unused: [],
    },
    categories: { categories: [], mixed: [], unnamed: [] },
    validationErrors: [],
    ...overrides,
  };
}

describe('sample', () => {
  it('lists short lists in full and summarises long ones', () => {
    expect(sample(['a', 'b'])).toBe('a, b');
    expect(sample(['a', 'b', 'c'], 2)).toBe('a, b … and 1 more');
    expect(sample([])).toBe('');
  });
});

describe('renderReport', () => {
  it('summarises the run', () => {
    const report = renderReport(input());
    expect(report).toContain('Scrape of 2026-10-03.');
    expect(report).toContain('| Clean products | 4 |');
    expect(report).toContain('| Excluded | 1 |');
    expect(report).toContain('| Shelf IDs | 4 |');
    expect(report).toContain('## Validation\n\nPassed.');
  });

  it('is the same for the same input', () => {
    expect(renderReport(input())).toBe(renderReport(input()));
  });

  it('lists validation errors, capped', () => {
    const errors = Array.from({ length: LIST_LIMIT + 3 }, (_, i) => `product ${i}: broken`);
    const report = renderReport(input({ validationErrors: errors }));
    expect(report).toContain(`**${LIST_LIMIT + 3} errors.**`);
    expect(report).toContain('- product 0: broken');
    expect(report).not.toContain(`- product ${LIST_LIMIT}: broken`);
    expect(report).toContain('- … and 3 more');
  });

  it('names departments that need review', () => {
    const departments = {
      ...input().departments,
      unreviewed: ['600'],
      added: ['600'],
      unused: ['91208'],
    };
    const report = renderReport(input({ departments }));
    expect(report).toContain('- Unreviewed (1): 600 (PAKASTE) Jäätelökaapit');
    expect(report).toContain('- New in this scrape (1): 600 (PAKASTE) Jäätelökaapit');
    expect(report).toContain(
      '- In the table but not in this scrape (1): 91208 (MAITO) Maidot ja piimät',
    );
  });

  it('groups exclusions and load issues by reason', () => {
    const report = renderReport(
      input({
        exclusions: [
          { ean: '5', reason: 'no-location' },
          { ean: '6', reason: 'no-location' },
          { ean: '7', reason: 'unavailable' },
        ],
        loadIssues: [{ ean: null, reason: 'damaged-line' }],
      }),
    );
    expect(report).toContain('| no-location | 2 | 5, 6 |');
    expect(report).toContain('| unavailable | 1 | 7 |');
    expect(report).toContain('| damaged-line | 1 | (unreadable) |');
  });

  it('says None for empty sections', () => {
    expect(renderReport(input({ exclusions: [] }))).toContain('## Excluded products\n\nNone.');
    expect(renderReport(input())).toContain('- Unreviewed (0): none');
  });

  it('lists mixed and unnamed categories', () => {
    const report = renderReport(
      input({
        categories: {
          categories: [],
          mixed: [{ path: 'valmisruoka', votes: { frozen: 1, chilled: 4, ambient: 2 } }],
          unnamed: ['juomat'],
        },
      }),
    );
    expect(report).toContain(
      '- Mixed temperatures (1): valmisruoka (1 frozen / 4 chilled / 2 ambient)',
    );
    expect(report).toContain('- Named from their slug (1): juomat');
  });

  it('shows products and the department-only share per department, largest first', () => {
    const report = renderReport(input());
    const milk = report.indexOf('| 91208 | (MAITO) Maidot ja piimät | 3 | 33 % |');
    const ice = report.indexOf('| 600 | (PAKASTE) Jäätelökaapit | 1 | 100 % |');
    expect(milk).toBeGreaterThan(-1);
    expect(ice).toBeGreaterThan(milk);
  });

  it('escapes pipes in table cells', () => {
    const departments = {
      ...input().departments,
      table: [{ id: '600', name: 'A | B', kind: 'aisle' as const, temperature: 'frozen' as const }],
    };
    expect(renderReport(input({ departments }))).toContain('| 600 | A \\| B | 1 | 100 % |');
  });
});
