import type { ListItem } from '@pathfinder/core';
import type { ListEntry } from '../list/listState';
import type { ItemContent, NamedItem } from '../list/listStorage';

/**
 * One finished shop: the day and what was picked. Only the day, never the time
 * (docs/plans/device-storage.md §3).
 */
export type Trip = { day: string; items: NamedItem[] };

/** The shopper's answer to "Muistetaanko ostoksesi?"; null until they answer. */
export type Consent = 'yes' | 'no' | null;

/** The history keeps at most this many trips, the newest. */
export const MAX_TRIPS = 50;

/** And none older than this many days. */
export const MAX_AGE_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A day as `YYYY-MM-DD`, in local time. */
export function dayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whether a string is a day as `dayOf` writes it. */
export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Whole days from one `YYYY-MM-DD` to another; negative if `to` is earlier. Counted on UTC
 * dates, so a daylight-saving change never makes a day 23 or 25 hours long.
 */
export function daysBetween(from: string, to: string): number {
  const utc = (day: string) => {
    const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** A list item's content: without its id and tick. */
function contentOf(item: ListItem): ItemContent {
  return item.kind === 'product'
    ? { kind: 'product', ean: item.ean, quantity: item.quantity }
    : { kind: 'generic', categoryId: item.categoryId, label: item.label, quantity: item.quantity };
}

/**
 * The trip to record when "Valmis" is pressed, or null if none is: only with consent
 * `"yes"`, and only the ticked items, the nearest the app gets to "bought". A shop with
 * nothing ticked is not recorded.
 */
export function tripToRecord(
  consent: Consent,
  list: readonly ListEntry[],
  day: string,
): Trip | null {
  if (consent !== 'yes') return null;
  const items = list
    .filter((entry) => entry.item.checked)
    .map((entry) => ({ item: contentOf(entry.item), name: entry.name }));
  return items.length === 0 ? null : { day, items };
}

/**
 * The history kept: trips no older than `MAX_AGE_DAYS` on `today`, then the newest
 * `MAX_TRIPS` of them. Trips are kept in the order they were recorded, oldest first.
 */
export function trimHistory(history: readonly Trip[], today: string): Trip[] {
  return history.filter((trip) => daysBetween(trip.day, today) <= MAX_AGE_DAYS).slice(-MAX_TRIPS);
}
