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

/** Writes the history, or removes the key when it is empty. Never throws. */
function saveHistory(history: readonly Trip[], store: ReturnType<typeof pageStorage>) {
  try {
    if (history.length === 0) store?.removeItem(HISTORY_KEY);
    else store?.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked: the history is not kept after this visit.
  }
}

/**
 * Adds a trip and saves the history, both read from storage first, not from memory. The
 * answer: if another tab has since said "no", nothing is saved and the history returned is
 * empty, since nothing is kept without consent. The history: a tab left open for days never overwrites
 * trips another tab recorded. Returns the history as saved; if storage fails, the trip is
 * kept in the history returned, for this visit only.
 */
export function recordTrip(trip: Trip, today: string, store = pageStorage()): Trip[] {
  if (loadConsent(store) === 'no') return [];
  const history = trimHistory([...loadHistory(today, store), trip], today);
  saveHistory(history, store);
  return history;
}

/**
 * Run once on start: makes what is saved match the answer. Without a "yes", any history
 * left over (from another tab, or an older version) is deleted; with one, the history is
 * written back trimmed, so trips past a year are gone from the device even when no new trip
 * is recorded. Safe to run twice.
 */
export function tidyHistory(today: string, store = pageStorage()) {
  if (loadConsent(store) === 'yes') saveHistory(loadHistory(today, store), store);
  else forgetHistory(store);
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
