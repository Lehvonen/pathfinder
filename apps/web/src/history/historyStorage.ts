import {
  isRecord,
  MAX_SAVED_ROWS,
  type NamedItem,
  pageStorage,
  readNamedItem,
} from '../list/listStorage';
import { type Consent, isDay, MAX_TRIPS, type Trip, trimHistory } from './history';

/** Where the history is saved, only with consent (docs/plans/device-storage.md §1). */
export const HISTORY_KEY = 'pathfinder.history.v1';

/** Where the answer to "Muistetaanko ostoksesi?" is saved; no key means no answer yet. */
export const CONSENT_KEY = 'pathfinder.historyConsent.v1';

/**
 * Saved trips, checked: each needs a `YYYY-MM-DD` day and at least one usable item, and each
 * item goes through the list's own row check (`readNamedItem`). Only the last `MAX_TRIPS`
 * trips and `MAX_SAVED_ROWS` items per trip are read, so corrupt storage cannot stall the
 * start. Anything not shaped like a history gives an empty one.
 */
export function parseHistory(raw: unknown): Trip[] {
  if (!Array.isArray(raw)) return [];
  const history: Trip[] = [];
  for (const trip of raw.slice(-MAX_TRIPS)) {
    if (!isRecord(trip) || !isDay(trip.day) || !Array.isArray(trip.items)) continue;
    const items = trip.items
      .slice(0, MAX_SAVED_ROWS)
      .map(readNamedItem)
      .filter((item): item is NamedItem => item !== null);
    if (items.length > 0) history.push({ day: trip.day, items });
  }
  return history;
}

/** The saved history, checked and trimmed for `today`; empty if there is none or it fails. */
export function loadHistory(today: string, store = pageStorage()): Trip[] {
  try {
    const saved = store?.getItem(HISTORY_KEY);
    if (saved === null || saved === undefined) return [];
    return trimHistory(parseHistory(JSON.parse(saved)), today);
  } catch {
    return [];
  }
}

/**
 * Adds a trip and saves the history, read from storage first, not from memory: a tab left
 * open for days then never overwrites trips another tab recorded. Returns the history as
 * saved. If storage fails, the trip is kept in the history returned, for this visit only.
 */
export function recordTrip(trip: Trip, today: string, store = pageStorage()): Trip[] {
  const history = trimHistory([...loadHistory(today, store), trip], today);
  try {
    store?.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked: the trip is not kept after this visit.
  }
  return history;
}

/** Deletes the saved history at once. */
export function forgetHistory(store = pageStorage()) {
  try {
    store?.removeItem(HISTORY_KEY);
  } catch {
    // Storage blocked: there was nothing saved to delete.
  }
}

/** The saved answer, or null if the shopper has not answered or it cannot be read. */
export function loadConsent(store = pageStorage()): Consent {
  try {
    const saved = store?.getItem(CONSENT_KEY);
    return saved === 'yes' || saved === 'no' ? saved : null;
  } catch {
    return null;
  }
}

/** Saves the shopper's answer. "no" also deletes the history: nothing is kept without consent. */
export function saveConsent(consent: 'yes' | 'no', store = pageStorage()) {
  try {
    store?.setItem(CONSENT_KEY, consent);
  } catch {
    // Storage blocked: the answer holds for this visit only.
  }
  if (consent === 'no') forgetHistory(store);
}
