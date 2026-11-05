import type { ListItem } from '@pathfinder/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampQuantity,
  type ListEntry,
  listReducer,
  MAX_QUANTITY,
  newItemId,
  pickedCount,
} from './listState';

describe('newItemId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID where the page has it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
    expect(newItemId()).toBe('uuid-1');
  });

  it('still makes different ids on a plain-http page, which has no crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {});
    const ids = Array.from({ length: 100 }, () => newItemId());
    expect(new Set(ids).size).toBe(100);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });
});

const milk: ListItem = { id: 'a', kind: 'product', ean: '111', quantity: 1, checked: false };
const bread: ListItem = { id: 'b', kind: 'product', ean: '222', quantity: 1, checked: false };
const anyMilk: ListItem = {
  id: 'c',
  kind: 'generic',
  categoryId: 7,
  label: 'maito',
  quantity: 1,
  checked: false,
};

/** The list after adding each item in turn, named by its id. */
function listOf(...items: ListItem[]): ListEntry[] {
  return items.reduce<ListEntry[]>(
    (list, item) => listReducer(list, { type: 'add', item, name: item.id }),
    [],
  );
}

const quantities = (list: ListEntry[]) => list.map((entry) => entry.item.quantity);

describe('clampQuantity', () => {
  it('keeps whole numbers from 1 to the maximum', () => {
    expect(clampQuantity(1)).toBe(1);
    expect(clampQuantity(12)).toBe(12);
    expect(clampQuantity(MAX_QUANTITY)).toBe(MAX_QUANTITY);
  });

  it('pulls anything else into that range', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-3)).toBe(1);
    expect(clampQuantity(MAX_QUANTITY + 1)).toBe(MAX_QUANTITY);
    expect(clampQuantity(2.6)).toBe(3);
    expect(clampQuantity(Number.NaN)).toBe(1);
  });
});

describe('listReducer: add', () => {
  it('adds new items to the end, with their names', () => {
    const list = listOf(milk, bread);
    expect(list.map((entry) => [entry.item.id, entry.name])).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ]);
  });

  it('adds to the quantity of a product already on the list instead of a second row', () => {
    const list = listOf(milk, bread, { ...milk, id: 'a2', quantity: 2 });
    expect(list.map((entry) => entry.item.id)).toEqual(['a', 'b']);
    expect(quantities(list)).toEqual([3, 1]);
  });

  it('adds to the quantity of the same generic word in the same category', () => {
    const list = listOf(anyMilk, { ...anyMilk, id: 'c2' });
    expect(list).toHaveLength(1);
    expect(quantities(list)).toEqual([2]);
  });

  it('keeps a different word, or the same word in another category, as its own row', () => {
    const list = listOf(
      anyMilk,
      { ...anyMilk, id: 'd', label: 'kevytmaito' },
      { ...anyMilk, id: 'e', categoryId: 8 },
    );
    expect(list).toHaveLength(3);
  });

  it('never goes over the maximum', () => {
    const list = listOf({ ...milk, quantity: MAX_QUANTITY }, milk);
    expect(quantities(list)).toEqual([MAX_QUANTITY]);
  });
});

describe('listReducer: remove', () => {
  it('takes only that item off the list', () => {
    const list = listReducer(listOf(milk, bread, anyMilk), { type: 'remove', id: 'b' });
    expect(list.map((entry) => entry.item.id)).toEqual(['a', 'c']);
  });

  it('leaves the list as it is for an id not on it', () => {
    const list = listReducer(listOf(milk), { type: 'remove', id: 'x' });
    expect(list.map((entry) => entry.item.id)).toEqual(['a']);
  });
});

describe('listReducer: setQuantity', () => {
  it('sets the quantity of that item only', () => {
    const list = listReducer(listOf(milk, bread), { type: 'setQuantity', id: 'b', quantity: 4 });
    expect(quantities(list)).toEqual([1, 4]);
  });

  it('never drops below 1; removing is its own action', () => {
    const list = listReducer(listOf(milk), { type: 'setQuantity', id: 'a', quantity: 0 });
    expect(quantities(list)).toEqual([1]);
  });

  it('does not change the list it was given', () => {
    const before = listOf(milk);
    listReducer(before, { type: 'setQuantity', id: 'a', quantity: 5 });
    expect(quantities(before)).toEqual([1]);
  });
});

describe('listReducer: setChecked', () => {
  const checked = (list: ListEntry[]) => list.map((entry) => entry.item.checked);

  it('ticks and unticks only that item', () => {
    const ticked = listReducer(listOf(milk, bread), { type: 'setChecked', id: 'b', checked: true });
    expect(checked(ticked)).toEqual([false, true]);
    const unticked = listReducer(ticked, { type: 'setChecked', id: 'b', checked: false });
    expect(checked(unticked)).toEqual([false, false]);
  });

  it('keeps the amount and the name', () => {
    const [entry] = listReducer(listOf({ ...milk, quantity: 3 }), {
      type: 'setChecked',
      id: 'a',
      checked: true,
    });
    expect(entry).toEqual({ item: { ...milk, quantity: 3, checked: true }, name: 'a' });
  });

  it('unticks an item when more of it is added: there is more to pick up', () => {
    const ticked = listReducer(listOf(milk), { type: 'setChecked', id: 'a', checked: true });
    const added = listReducer(ticked, { type: 'add', item: { ...milk, id: 'a2' }, name: 'a' });
    expect(checked(added)).toEqual([false]);
    expect(quantities(added)).toEqual([2]);
  });
});

describe('listReducer: clear', () => {
  it('empties the list', () => {
    expect(listReducer(listOf(milk, bread), { type: 'clear' })).toEqual([]);
  });
});

describe('listReducer: quantity and ticks', () => {
  const tickedMilk = () =>
    listReducer(listOf(milk), { type: 'setChecked', id: 'a', checked: true });

  it('unticks an item when the stepper raises its amount', () => {
    const raised = listReducer(tickedMilk(), { type: 'setQuantity', id: 'a', quantity: 2 });
    expect(raised[0]!.item).toMatchObject({ quantity: 2, checked: false });
  });

  it('keeps it ticked when the amount goes down or stays the same', () => {
    const twoTicked = listReducer(
      listReducer(listOf({ ...milk, quantity: 2 }), { type: 'setChecked', id: 'a', checked: true }),
      { type: 'setQuantity', id: 'a', quantity: 1 },
    );
    expect(twoTicked[0]!.item).toMatchObject({ quantity: 1, checked: true });
    const same = listReducer(tickedMilk(), { type: 'setQuantity', id: 'a', quantity: 1 });
    expect(same[0]!.item.checked).toBe(true);
    // At the cap, + changes nothing, so nothing is unticked either.
    const capped = listReducer(
      listReducer(listOf({ ...milk, quantity: MAX_QUANTITY }), {
        type: 'setChecked',
        id: 'a',
        checked: true,
      }),
      { type: 'setQuantity', id: 'a', quantity: MAX_QUANTITY + 1 },
    );
    expect(capped[0]!.item.checked).toBe(true);
  });
});

describe('pickedCount', () => {
  it('adds up the amounts of ticked items only', () => {
    let list = listOf({ ...milk, quantity: 3 }, bread, anyMilk);
    expect(pickedCount(list)).toBe(0);
    list = listReducer(list, { type: 'setChecked', id: 'a', checked: true });
    list = listReducer(list, { type: 'setChecked', id: 'c', checked: true });
    expect(pickedCount(list)).toBe(4);
  });
});
