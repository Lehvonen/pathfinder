import { describe, expect, it } from 'vitest';
import type { ListEntry } from '../list/listState';
import type { NamedItem } from '../list/listStorage';
import type { Trip } from './history';
import { MAX_SUGGESTIONS, suggestions, tripWeight } from './ranking';

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
    const history = [trip('2026-11-01', product('1'), product('2')), trip(today, product('1'))];
    expect(names(suggestions(history, [], today))).toEqual(['Tuote 1']);
  });

  it('counts a thing twice in one trip as one trip', () => {
    const history = [trip(today, product('1'), product('1'))];
    expect(suggestions(history, [], today)).toEqual([]);
  });

  it('suggests all of 8, and at most 8 of 9', () => {
    const things = (n: number) => Array.from({ length: n }, (_, i) => product(`${i}`));
    const twice = (n: number) => [trip('2026-11-01', ...things(n)), trip(today, ...things(n))];
    expect(suggestions(twice(MAX_SUGGESTIONS), [], today)).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestions(twice(MAX_SUGGESTIONS + 1), [], today)).toHaveLength(MAX_SUGGESTIONS);
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

  it('weighs a trip by its age: half at 30 days, a quarter at 60', () => {
    expect(tripWeight(0)).toBe(1);
    expect(tripWeight(30)).toBeCloseTo(0.5, 10);
    expect(tripWeight(60)).toBeCloseTo(0.25, 10);
    expect(tripWeight(-5)).toBe(1);
  });

  it('puts recent trips first: four trips a month ago tie with two today, five win', () => {
    const monthAgo = '2026-10-09';
    const twoToday = [trip(today, product('new')), trip(today, product('new'))];
    const old = (n: number) => Array.from({ length: n }, () => trip(monthAgo, product('old')));
    // Four at 0.5 each make 2.0, a tie, which goes to the more recently picked.
    expect(names(suggestions([...old(4), ...twoToday], [], today))).toEqual([
      'Tuote new',
      'Tuote old',
    ]);
    expect(names(suggestions([...old(5), ...twoToday], [], today))).toEqual([
      'Tuote old',
      'Tuote new',
    ]);
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
