import { describe, expect, it } from 'vitest';
import type { ListEntry } from '../list/listState';
import type { NamedItem } from '../list/listStorage';
import type { Trip } from './history';
import { HALF_LIFE_DAYS, MAX_SUGGESTIONS, MIN_TRIPS, suggestions } from './ranking';

const today = '2026-11-08';

/** A product picked, named after its EAN. */
const product = (ean: string, name = `Tuote ${ean}`): NamedItem => ({
  item: { kind: 'product', ean, quantity: 1 },
  name,
});
const trip = (day: string, ...items: NamedItem[]): Trip => ({ day, items });
const names = (picked: NamedItem[]) => picked.map((thing) => thing.name);

describe('suggestions', () => {
  it('suggests things picked on at least 2 trips, not on 1', () => {
    expect(MIN_TRIPS).toBe(2);
    const history = [trip('2026-11-01', product('1'), product('2')), trip(today, product('1'))];
    expect(names(suggestions(history, [], today))).toEqual(['Tuote 1']);
  });

  it('counts a thing twice in one trip as one trip', () => {
    const history = [trip(today, product('1'), product('1'))];
    expect(suggestions(history, [], today)).toEqual([]);
  });

  it('suggests at most 8 of 9', () => {
    const nine = Array.from({ length: MAX_SUGGESTIONS + 1 }, (_, i) => product(`${i}`));
    const history = [trip('2026-11-01', ...nine), trip(today, ...nine)];
    expect(suggestions(history, [], today)).toHaveLength(MAX_SUGGESTIONS);
  });

  it('leaves out what is already on the list', () => {
    const history = [
      trip('2026-11-01', product('1'), product('2')),
      trip(today, product('1'), product('2')),
    ];
    const list: ListEntry[] = [
      {
        item: { id: 'a', kind: 'product', ean: '1', quantity: 3, checked: false },
        name: 'Maito',
      },
    ];
    expect(names(suggestions(history, list, today))).toEqual(['Tuote 2']);
  });

  it('puts recent trips first: a trip 30 days old counts half', () => {
    const monthAgo = '2026-10-09';
    // Three trips a month ago (1.5) lose to two trips today (2).
    const history = [
      trip(monthAgo, product('old')),
      trip(monthAgo, product('old')),
      trip(monthAgo, product('old')),
      trip(today, product('new')),
      trip(today, product('new')),
    ];
    expect(HALF_LIFE_DAYS).toBe(30);
    expect(names(suggestions(history, [], today))).toEqual(['Tuote new', 'Tuote old']);
  });

  it('breaks a tie by the more recently picked', () => {
    // A trip dated after today (a wrong clock) counts fully, so both score exactly 2.
    const history = [
      trip(today, product('earlier')),
      trip(today, product('earlier'), product('later')),
      trip('2026-11-09', product('later')),
    ];
    expect(names(suggestions(history, [], today))).toEqual(['Tuote later', 'Tuote earlier']);
  });

  it('matches generic entries on the word and category, shown by the latest name', () => {
    const cheese = (name: string): NamedItem => ({
      item: { kind: 'generic', categoryId: 9, label: 'juusto', quantity: 1 },
      name,
    });
    const history = [
      trip('2026-11-01', cheese('juusto')),
      trip(today, cheese('"juusto" (Juustot)')),
    ];
    expect(names(suggestions(history, [], today))).toEqual(['"juusto" (Juustot)']);
  });

  it('suggests nothing from an empty history', () => {
    expect(suggestions([], [], today)).toEqual([]);
  });
});
