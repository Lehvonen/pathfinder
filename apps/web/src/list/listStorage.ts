import type { ListItem } from '@pathfinder/core';
import { clampQuantity, isSameThing, type ListEntry, newItemId } from './listState';

/** Where the list is saved. The version is in the key: a new format gets a new key. */
export const LIST_KEY = 'pathfinder.list.v1';

/**
 * If the list was not saved for this long, its ticks are cleared on load. It is saved on
 * every change and every start, so this is 12 hours with the app unused, not the age of a
 * tick. A shopper who paid and closed the app without "Valmis" would otherwise find those
 * items left out of next week's route; no shop lasts 12 hours.
 */
export const STALE_TICKS_MS = 12 * 60 * 60 * 1000;

/**
 * Rows beyond this many are ignored on load. A real list is a few dozen rows; the cap only
 * stops corrupt or tampered storage from freezing the start, since merging is quadratic.
 */
export const MAX_SAVED_ROWS = 500;

/** The part of `Storage` used here, so tests can pass a plain stand-in. */
export type ListStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** `Omit` for each member of a union, so `kind` still tells the members apart. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A list item without its id and tick: what to buy and how many. */
export type ItemContent = DistributiveOmit<ListItem, 'id' | 'checked'>;

/**
 * The page's `localStorage`, or null where there is none: reading it throws when site data
 * is blocked, and there is no `window` in tests.
 */
export function pageStorage(): ListStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A plain object, not null or an array. Exported for the purchase history's own checks. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * An item's content read back from storage, rebuilt from its known fields only, so nothing
 * unknown is ever written back; null if it is not a usable product or generic entry. A
 * string `categoryId` is refused: the category lookup would miss it and the item would be
 * silently left unplaced. Shared with the purchase history (docs/plans/device-storage.md).
 */
export function readItem(raw: unknown): ItemContent | null {
  if (!isRecord(raw) || typeof raw.quantity !== 'number') return null;
  const quantity = clampQuantity(raw.quantity);
  if (raw.kind === 'product' && isFilledString(raw.ean)) {
    return { kind: 'product', ean: raw.ean, quantity };
  }
  const { categoryId } = raw;
  if (
    raw.kind === 'generic' &&
    typeof categoryId === 'number' &&
    Number.isInteger(categoryId) &&
    isFilledString(raw.label)
  ) {
    return { kind: 'generic', categoryId, label: raw.label, quantity };
  }
  return null;
}

/** An item's content and the name it is shown by: a list row without id and tick. */
export type NamedItem = { item: ItemContent; name: string };

/**
 * A `{ item, name }` row read back from storage: the item checked by `readItem`, the name a
 * non-empty string; null otherwise. The one row check shared by the saved list and the
 * purchase history.
 */
export function readNamedItem(raw: unknown): NamedItem | null {
  if (!isRecord(raw) || !isFilledString(raw.name)) return null;
  const item = readItem(raw.item);
  return item === null ? null : { item, name: raw.name };
}

/**
 * The saved list, checked row by row. A row that is not usable is dropped; a missing or
 * repeated id gets a new one; two rows for the same thing are merged into the first, amounts
 * added and ticked only if both were. Ticks are cleared if the list was saved more than
 * `STALE_TICKS_MS` before `now`; a save time in the future keeps them. Rows beyond
 * `MAX_SAVED_ROWS` are ignored. Anything not shaped like a saved list gives an empty one.
 */
export function parseSavedList(raw: unknown, now: number): ListEntry[] {
  if (!isRecord(raw) || typeof raw.savedAt !== 'number' || !Array.isArray(raw.entries)) {
    return [];
  }
  const stale = now - raw.savedAt > STALE_TICKS_MS;
  const ids = new Set<string>();
  const list: ListEntry[] = [];
  for (const row of raw.entries.slice(0, MAX_SAVED_ROWS)) {
    const named = readNamedItem(row);
    if (named === null || !isRecord(row) || !isRecord(row.item)) continue;
    const checked = !stale && row.item.checked === true;
    const savedId = row.item.id;
    const id = isFilledString(savedId) && !ids.has(savedId) ? savedId : newItemId();
    const item: ListItem = { ...named.item, id, checked };
    const index = list.findIndex((entry) => isSameThing(entry.item, item));
    const first = list[index];
    if (first === undefined) {
      ids.add(id);
      list.push({ item, name: named.name });
      continue;
    }
    list[index] = {
      ...first,
      item: {
        ...first.item,
        quantity: clampQuantity(first.item.quantity + item.quantity),
        checked: first.item.checked && item.checked,
      },
    };
  }
  return list;
}

/**
 * The list saved on this device, or an empty one if there is none, it cannot be read, or
 * storage is unavailable. Only reads: React calls this twice in development.
 */
export function loadList(store = pageStorage(), now = Date.now()): ListEntry[] {
  try {
    const saved = store?.getItem(LIST_KEY);
    if (saved === null || saved === undefined) return [];
    return parseSavedList(JSON.parse(saved), now);
  } catch {
    return [];
  }
}

/**
 * Saves the list with the time, or removes the key when the list is empty. Does nothing if
 * storage is unavailable or full: the list then lives in memory only, with no error shown.
 */
export function saveList(list: readonly ListEntry[], store = pageStorage(), now = Date.now()) {
  try {
    if (list.length === 0) store?.removeItem(LIST_KEY);
    else store?.setItem(LIST_KEY, JSON.stringify({ savedAt: now, entries: list }));
  } catch {
    // Storage full or blocked: keep the list in memory only.
  }
}
