import type { ListItem } from '@pathfinder/core';
import { describe, expect, it } from 'vitest';
import {
  LIST_KEY,
  loadList,
  MAX_SAVED_ROWS,
  parseSavedList,
  readItem,
  readNamedItem,
  saveList,
  STALE_TICKS_MS,
} from './listStorage';
import { brokenStore, memoryStore } from './storeStubs';
import { type ListEntry, MAX_QUANTITY } from './listState';

const now = 1_800_000_000_000;

const milk: ListItem = { id: 'a', kind: 'product', ean: '111', quantity: 2, checked: true };
const anyMilk: ListItem = {
  id: 'b',
  kind: 'generic',
  categoryId: 7,
  label: 'maito',
  quantity: 1,
  checked: false,
};
const list: ListEntry[] = [
  { item: milk, name: 'Maito 1 l' },
  { item: anyMilk, name: '"maito" (Maidot)' },
];

/** A saved list as storage would hold it, before `JSON.parse`. */
const saved = (entries: unknown[], savedAt = now) => ({ savedAt, entries });

describe('saveList and loadList', () => {
  it('give back the list as it was saved, ticks and all', () => {
    const store = memoryStore();
    saveList(list, store, now);
    expect(loadList(store, now)).toEqual(list);
  });

  it('save the time with the list', () => {
    const store = memoryStore();
    saveList(list, store, now);
    expect(JSON.parse(store.data.get(LIST_KEY) ?? '')).toMatchObject({ savedAt: now });
  });

  it('remove the key for an empty list', () => {
    const store = memoryStore();
    saveList(list, store, now);
    saveList([], store, now);
    expect(store.data.has(LIST_KEY)).toBe(false);
  });

  it('load an empty list when nothing is saved', () => {
    expect(loadList(memoryStore(), now)).toEqual([]);
  });

  it('load an empty list from text that is not JSON', () => {
    const store = memoryStore();
    store.data.set(LIST_KEY, '{not json');
    expect(loadList(store, now)).toEqual([]);
  });

  it('load an empty list when storage is blocked', () => {
    expect(loadList(brokenStore, now)).toEqual([]);
  });

  it('never throw when storage is full or blocked on save', () => {
    expect(() => saveList(list, brokenStore, now)).not.toThrow();
    expect(() => saveList([], brokenStore, now)).not.toThrow();
  });

  it('do nothing when there is no storage', () => {
    expect(loadList(null, now)).toEqual([]);
    expect(() => saveList(list, null, now)).not.toThrow();
  });
});

describe('readItem', () => {
  it('reads a product and a generic entry', () => {
    expect(readItem(milk)).toEqual({ kind: 'product', ean: '111', quantity: 2 });
    expect(readItem(anyMilk)).toEqual({
      kind: 'generic',
      categoryId: 7,
      label: 'maito',
      quantity: 1,
    });
  });

  it('keeps only the known fields', () => {
    expect(readItem({ ...milk, extra: 'x', price: 3 })).toEqual({
      kind: 'product',
      ean: '111',
      quantity: 2,
    });
  });

  it('pulls the amount into 1 to the maximum', () => {
    expect(readItem({ ...milk, quantity: 0 })?.quantity).toBe(1);
    expect(readItem({ ...milk, quantity: 500 })?.quantity).toBe(MAX_QUANTITY);
    expect(readItem({ ...milk, quantity: 2.6 })?.quantity).toBe(3);
    // `JSON.parse('1e999')` gives Infinity.
    expect(readItem({ ...milk, quantity: JSON.parse('1e999') })?.quantity).toBe(1);
  });

  it('refuses anything that is not a usable item', () => {
    const refused: unknown[] = [
      null,
      'milk',
      [milk],
      { ...milk, ean: 111 },
      { ...milk, ean: '' },
      { ...milk, quantity: '2' },
      { ...milk, kind: 'shelf' },
      { ...anyMilk, categoryId: '7' },
      { ...anyMilk, categoryId: 7.5 },
      { ...anyMilk, label: ' ' },
    ];
    for (const raw of refused) expect(readItem(raw)).toBeNull();
  });
});

describe('readNamedItem', () => {
  it('reads an item with its name', () => {
    expect(readNamedItem({ item: milk, name: 'Maito 1 l', extra: 1 })).toEqual({
      item: { kind: 'product', ean: '111', quantity: 2 },
      name: 'Maito 1 l',
    });
  });

  it('refuses a row with no usable item or no name', () => {
    const refused: unknown[] = [
      null,
      [],
      { item: milk },
      { item: milk, name: '' },
      { item: milk, name: 3 },
      { item: { ...milk, ean: '' }, name: 'Maito' },
      { name: 'Maito' },
    ];
    for (const raw of refused) expect(readNamedItem(raw)).toBeNull();
  });
});

describe('parseSavedList', () => {
  it('gives an empty list for anything not shaped like a saved list', () => {
    for (const raw of [null, [], 'list', { entries: [] }, { savedAt: now }, list]) {
      expect(parseSavedList(raw, now)).toEqual([]);
    }
  });

  it('drops the rows it cannot use and keeps the rest', () => {
    const raw = saved([
      { item: milk, name: 'Maito 1 l' },
      { item: { ...anyMilk, categoryId: '7' }, name: 'maito' },
      { item: milk, name: '' },
      { item: anyMilk },
      'row',
    ]);
    expect(parseSavedList(raw, now)).toEqual([list[0]]);
  });

  it('unticks anything not ticked with a plain true', () => {
    const raw = saved([{ item: { ...milk, checked: 'yes' }, name: 'Maito 1 l' }]);
    expect(parseSavedList(raw, now)[0]?.item.checked).toBe(false);
  });

  it('gives missing and repeated ids new ones, keeping the first', () => {
    const raw = saved([
      { item: milk, name: 'Maito 1 l' },
      { item: { ...anyMilk, id: 'a' }, name: 'maito' },
      { item: { kind: 'generic', categoryId: 3, label: 'leipä', quantity: 1 }, name: 'leipä' },
    ]);
    const ids = parseSavedList(raw, now).map((entry) => entry.item.id);
    expect(ids[0]).toBe('a');
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id !== '')).toBe(true);
  });

  it('merges two rows for the same thing into the first', () => {
    const raw = saved([
      { item: milk, name: 'Maito 1 l' },
      { item: anyMilk, name: 'maito' },
      { item: { ...milk, id: 'c', quantity: 3, checked: false }, name: 'Maito' },
    ]);
    const merged = parseSavedList(raw, now);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({
      item: { ...milk, quantity: 5, checked: false },
      name: 'Maito 1 l',
    });
  });

  it('ticks a merged row only if both rows were ticked', () => {
    const raw = saved([
      { item: milk, name: 'Maito 1 l' },
      { item: { ...milk, id: 'c' }, name: 'Maito' },
    ]);
    expect(parseSavedList(raw, now)[0]?.item.checked).toBe(true);
  });

  it('keeps ticks for 12 hours and clears them after', () => {
    const rows = [{ item: milk, name: 'Maito 1 l' }];
    const ticked = (savedAt: number) => parseSavedList(saved(rows, savedAt), now)[0]?.item.checked;
    expect(ticked(now - STALE_TICKS_MS)).toBe(true);
    expect(ticked(now - STALE_TICKS_MS - 1)).toBe(false);
  });
});

describe('parseSavedList: edge cases', () => {
  it('caps a merged amount at the maximum', () => {
    const raw = saved([
      { item: { ...milk, quantity: 98 }, name: 'Maito 1 l' },
      { item: { ...milk, id: 'c', quantity: 5 }, name: 'Maito' },
    ]);
    expect(parseSavedList(raw, now)[0]?.item.quantity).toBe(MAX_QUANTITY);
  });

  it('merges a repeated id into its row, and renames a different thing using it', () => {
    const bread: ListItem = { ...milk, ean: '222', quantity: 1 };
    const raw = saved([
      { item: milk, name: 'Maito 1 l' },
      { item: milk, name: 'Maito 1 l' },
      { item: bread, name: 'Leipä' },
    ]);
    const parsed = parseSavedList(raw, now);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.item).toMatchObject({ id: 'a', ean: '111', quantity: 4 });
    expect(parsed[1]?.item).toMatchObject({ ean: '222' });
    expect(parsed[1]?.item.id).not.toBe('a');
  });

  it('keeps ticks when the save time is in the future', () => {
    const raw = saved([{ item: milk, name: 'Maito 1 l' }], now + STALE_TICKS_MS);
    expect(parseSavedList(raw, now)[0]?.item.checked).toBe(true);
  });

  it('ignores rows beyond the cap', () => {
    const rows = Array.from({ length: MAX_SAVED_ROWS + 1 }, (_, i) => ({
      item: { ...milk, id: `id-${i}`, ean: `${i}` },
      name: `Tuote ${i}`,
    }));
    const parsed = parseSavedList(saved(rows), now);
    expect(parsed).toHaveLength(MAX_SAVED_ROWS);
    expect(parsed.at(-1)?.item.id).toBe(`id-${MAX_SAVED_ROWS - 1}`);
  });
});
