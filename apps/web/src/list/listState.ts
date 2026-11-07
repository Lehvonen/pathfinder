import type { ListItem } from '@pathfinder/core';

/**
 * One row of the shopping list: the item, and the name it is shown by. A product
 * `ListItem` holds only its EAN, so the name the shopper picked is kept beside it rather
 * than looked up in the search data on every render.
 */
export type ListEntry = { item: ListItem; name: string };

export type ListAction =
  | { type: 'add'; item: ListItem; name: string }
  | { type: 'remove'; id: string }
  | { type: 'setQuantity'; id: string; quantity: number }
  | { type: 'setChecked'; id: string; checked: boolean }
  | { type: 'clear' };

/** The most of one item a list holds; the stepper stops here. */
export const MAX_QUANTITY = 99;

/** Whole numbers from 1 to MAX_QUANTITY; anything else is pulled into that range. */
export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity)));
}

let idCount = 0;

/**
 * A new `ListItem` id. `crypto.randomUUID()` exists only on secure pages (https and
 * localhost), not on the dev server opened from a phone over the local network
 * (`http://192.168.…`). There, the time plus a counter does: an id only has to be unique
 * within one list, and ids are made again when a shared list is loaded.
 */
export function newItemId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  idCount += 1;
  return `${Date.now().toString(36)}-${idCount.toString(36)}`;
}

/**
 * The same thing on the list: one product, or one generic word in one category. Exported
 * so a saved list read back from storage merges its rows by the same rule.
 */
export function isSameThing(a: ListItem, b: ListItem): boolean {
  if (a.kind === 'product' && b.kind === 'product') return a.ean === b.ean;
  if (a.kind === 'generic' && b.kind === 'generic') {
    return a.categoryId === b.categoryId && a.label === b.label;
  }
  return false;
}

function withQuantity(entry: ListEntry, quantity: number): ListEntry {
  return { ...entry, item: { ...entry.item, quantity: clampQuantity(quantity) } };
}

/** A new amount; if it rose, the item is unticked, since more of it is still to be picked. */
function withNewQuantity(entry: ListEntry, quantity: number): ListEntry {
  const changed = withQuantity(entry, quantity);
  const rose = changed.item.quantity > entry.item.quantity;
  return rose ? { ...changed, item: { ...changed.item, checked: false } } : changed;
}

/**
 * The list's state changes, for `useReducer`. Adding something already on the list adds
 * to its quantity instead of a second row. Any rise in quantity, by adding or with the
 * stepper, unticks the item: more of it is still to be picked. Quantity never drops below
 * 1: taking an item off the list is `remove`.
 * `setChecked` ticks an item as picked up in the store, or unticks it; `clear` empties the
 * list when the shop is done.
 */
export function listReducer(list: readonly ListEntry[], action: ListAction): ListEntry[] {
  switch (action.type) {
    case 'add': {
      const index = list.findIndex((entry) => isSameThing(entry.item, action.item));
      if (index === -1) {
        return [
          ...list,
          withQuantity({ item: action.item, name: action.name }, action.item.quantity),
        ];
      }
      return list.map((entry, i) =>
        i === index ? withNewQuantity(entry, entry.item.quantity + action.item.quantity) : entry,
      );
    }
    case 'remove':
      return list.filter((entry) => entry.item.id !== action.id);
    case 'setQuantity':
      return list.map((entry) =>
        entry.item.id === action.id ? withNewQuantity(entry, action.quantity) : entry,
      );
    case 'setChecked':
      return list.map((entry) =>
        entry.item.id === action.id
          ? { ...entry, item: { ...entry.item, checked: action.checked } }
          : entry,
      );
    case 'clear':
      return [];
  }
}

/**
 * How many things are ticked as picked: each ticked item's amount, added up. For the finish
 * card, so it counts every item picked on the trip, also those from before a re-plan.
 */
export function pickedCount(list: readonly ListEntry[]): number {
  return list.reduce((sum, entry) => sum + (entry.item.checked ? entry.item.quantity : 0), 0);
}
