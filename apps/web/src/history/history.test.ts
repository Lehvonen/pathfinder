import { describe, expect, it } from 'vitest';
import type { ListEntry } from '../list/listState';
import {
  dayOf,
  daysBetween,
  isDay,
  MAX_AGE_DAYS,
  MAX_TRIPS,
  type Trip,
  tripToRecord,
  trimHistory,
} from './history';

const milk: ListEntry = {
  item: { id: 'a', kind: 'product', ean: '111', quantity: 2, checked: true },
  name: 'Maito 1 l',
};
const bread: ListEntry = {
  item: { id: 'b', kind: 'product', ean: '222', quantity: 1, checked: false },
  name: 'Leipä',
};
const anyCheese: ListEntry = {
  item: { id: 'c', kind: 'generic', categoryId: 9, label: 'juusto', quantity: 1, checked: true },
  name: '"juusto" (Juustot)',
};

describe('dayOf and isDay', () => {
  it('write the local day as YYYY-MM-DD', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayOf(new Date(2026, 10, 30, 0, 1))).toBe('2026-11-30');
  });

  it('recognise only that form', () => {
    expect(isDay('2026-01-05')).toBe(true);
    for (const value of ['2026-1-5', '05.01.2026', '', 20260105, null]) {
      expect(isDay(value)).toBe(false);
    }
  });
});

describe('daysBetween', () => {
  it('counts whole days, across months and years', () => {
    expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0);
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2025-11-08', '2026-11-08')).toBe(365);
  });

  it('is negative when the second day is earlier', () => {
    expect(daysBetween('2026-01-05', '2026-01-02')).toBe(-3);
  });

  it('is not thrown off by daylight saving', () => {
    // Finland moves its clocks on the last Sundays of March and October.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('tripToRecord', () => {
  const list = [milk, bread, anyCheese];

  it('records the ticked items only, without id or tick', () => {
    expect(tripToRecord('yes', list, '2026-11-08')).toEqual({
      day: '2026-11-08',
      items: [
        { item: { kind: 'product', ean: '111', quantity: 2 }, name: 'Maito 1 l' },
        {
          item: { kind: 'generic', categoryId: 9, label: 'juusto', quantity: 1 },
          name: '"juusto" (Juustot)',
        },
      ],
    });
  });

  it('records nothing without consent', () => {
    expect(tripToRecord('no', list, '2026-11-08')).toBeNull();
    expect(tripToRecord(null, list, '2026-11-08')).toBeNull();
  });

  it('records nothing when nothing was ticked', () => {
    expect(tripToRecord('yes', [bread], '2026-11-08')).toBeNull();
    expect(tripToRecord('yes', [], '2026-11-08')).toBeNull();
  });
});

describe('trimHistory', () => {
  const trip = (day: string): Trip => ({ day, items: [] });

  it('keeps a trip 365 days old and drops one 366 days old', () => {
    const today = '2026-11-08';
    const kept = trip('2025-11-08');
    expect(daysBetween(kept.day, today)).toBe(MAX_AGE_DAYS);
    expect(trimHistory([trip('2025-11-07'), kept], today)).toEqual([kept]);
  });

  it('keeps the newest 50 of 51 trips', () => {
    const history = Array.from({ length: MAX_TRIPS + 1 }, (_, i) =>
      trip(dayOf(new Date(2026, 0, 1 + i))),
    );
    const trimmed = trimHistory(history, '2026-11-08');
    expect(trimmed).toHaveLength(MAX_TRIPS);
    expect(trimmed[0]).toBe(history[1]);
    expect(trimmed.at(-1)).toBe(history.at(-1));
  });

  it('keeps a trip dated after today, from a clock that was wrong', () => {
    const future = trip('2026-11-09');
    expect(trimHistory([future], '2026-11-08')).toEqual([future]);
  });
});
