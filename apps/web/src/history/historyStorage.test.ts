import { describe, expect, it } from 'vitest';
import { brokenStore, memoryStore } from '../list/storeStubs';
import { MAX_TRIPS, type Trip } from './history';
import {
  CONSENT_KEY,
  forgetHistory,
  HISTORY_KEY,
  loadConsent,
  loadHistory,
  parseHistory,
  recordTrip,
  saveConsent,
} from './historyStorage';

const today = '2026-11-08';
const milk = { item: { kind: 'product' as const, ean: '111', quantity: 2 }, name: 'Maito 1 l' };
const trip = (day: string): Trip => ({ day, items: [milk] });

describe('parseHistory', () => {
  it('reads trips as they were saved', () => {
    const history = [trip('2026-11-01'), trip('2026-11-08')];
    expect(parseHistory(JSON.parse(JSON.stringify(history)))).toEqual(history);
  });

  it('gives an empty history for anything not shaped like one', () => {
    for (const raw of [null, {}, 'trips', { trips: [] }]) expect(parseHistory(raw)).toEqual([]);
  });

  it('drops trips with a bad day, no items list or no usable item', () => {
    const raw = [
      { day: '8.11.2026', items: [milk] },
      { day: today },
      { day: today, items: [{ item: { kind: 'product', ean: '' }, name: 'x' }] },
      trip(today),
    ];
    expect(parseHistory(raw)).toEqual([trip(today)]);
  });

  it('drops bad items and keeps the rest, rebuilt from their known fields', () => {
    const raw = [{ day: today, items: [{ ...milk, extra: 1 }, { item: milk.item }, 'x'] }];
    expect(parseHistory(raw)).toEqual([trip(today)]);
  });

  it('reads only the last trips allowed', () => {
    const raw = Array.from({ length: MAX_TRIPS + 5 }, () => trip(today));
    expect(parseHistory(raw)).toHaveLength(MAX_TRIPS);
  });
});

describe('recordTrip and loadHistory', () => {
  it('add a trip to the saved history and read it back', () => {
    const store = memoryStore();
    recordTrip(trip('2026-11-01'), today, store);
    const history = recordTrip(trip(today), today, store);
    expect(history).toEqual([trip('2026-11-01'), trip(today)]);
    expect(loadHistory(today, store)).toEqual(history);
  });

  it('add to what is saved, not to an older copy another tab still holds', () => {
    const store = memoryStore();
    recordTrip(trip('2026-11-01'), today, store);
    // Another tab recorded a trip in between.
    store.data.set(HISTORY_KEY, JSON.stringify([trip('2026-11-01'), trip('2026-11-05')]));
    expect(recordTrip(trip(today), today, store)).toHaveLength(3);
  });

  it('trim when reading and when recording', () => {
    const store = memoryStore();
    store.data.set(HISTORY_KEY, JSON.stringify([trip('2025-11-07'), trip('2026-11-01')]));
    expect(loadHistory(today, store)).toEqual([trip('2026-11-01')]);
    expect(recordTrip(trip(today), today, store)).toEqual([trip('2026-11-01'), trip(today)]);
  });

  it('load an empty history from nothing saved or text that is not JSON', () => {
    const store = memoryStore();
    expect(loadHistory(today, store)).toEqual([]);
    store.data.set(HISTORY_KEY, '[not json');
    expect(loadHistory(today, store)).toEqual([]);
  });

  it('keep the trip for this visit when storage fails, and never throw', () => {
    expect(loadHistory(today, brokenStore)).toEqual([]);
    expect(recordTrip(trip(today), today, brokenStore)).toEqual([trip(today)]);
    expect(recordTrip(trip(today), today, null)).toEqual([trip(today)]);
  });
});

describe('forgetHistory', () => {
  it('deletes the saved history', () => {
    const store = memoryStore();
    recordTrip(trip(today), today, store);
    forgetHistory(store);
    expect(store.data.has(HISTORY_KEY)).toBe(false);
  });

  it('never throws', () => {
    expect(() => forgetHistory(brokenStore)).not.toThrow();
    expect(() => forgetHistory(null)).not.toThrow();
  });
});

describe('loadConsent and saveConsent', () => {
  it('give null until the shopper answers', () => {
    expect(loadConsent(memoryStore())).toBeNull();
  });

  it('give back the saved answer', () => {
    const store = memoryStore();
    saveConsent('yes', store);
    expect(loadConsent(store)).toBe('yes');
    saveConsent('no', store);
    expect(loadConsent(store)).toBe('no');
  });

  it('treat anything else saved as no answer', () => {
    const store = memoryStore();
    store.data.set(CONSENT_KEY, 'true');
    expect(loadConsent(store)).toBeNull();
  });

  it('delete the history when the answer is no', () => {
    const store = memoryStore();
    saveConsent('yes', store);
    recordTrip(trip(today), today, store);
    saveConsent('no', store);
    expect(store.data.has(HISTORY_KEY)).toBe(false);
  });

  it('never throw when storage fails', () => {
    expect(loadConsent(brokenStore)).toBeNull();
    expect(() => saveConsent('no', brokenStore)).not.toThrow();
    expect(() => saveConsent('yes', null)).not.toThrow();
  });
});
