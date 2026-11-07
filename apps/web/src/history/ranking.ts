import { type ListEntry, thingKey } from '../list/listState';
import type { NamedItem } from '../list/listStorage';
import { daysBetween, type Trip } from './history';

/** A thing is suggested once it was picked on at least this many trips. */
export const MIN_TRIPS = 2;

/** At most this many suggestions. */
export const MAX_SUGGESTIONS = 8;

/** A trip this many days old counts half as much as one today. */
export const HALF_LIFE_DAYS = 30;

type Tally = { thing: NamedItem; score: number; trips: number; lastDay: string };

/**
 * What one trip counts for, by its age in days: 1 today, halving every `HALF_LIFE_DAYS`. A
 * trip dated after today, from a clock that was wrong, counts as today's.
 */
export function tripWeight(ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

/**
 * "Usein ostamasi" (docs/plans/device-storage.md §4): things picked on at least `MIN_TRIPS`
 * trips and not on the list, best first, at most `MAX_SUGGESTIONS`. Each trip a thing was
 * picked on counts `0.5 ^ (age in days / HALF_LIFE_DAYS)`; ties go to the more recently
 * picked. Things are told apart by the list's own rule (`thingKey`, the key form of
 * `isSameThing`), and shown by the name from the latest trip.
 */
export function suggestions(
  history: readonly Trip[],
  list: readonly ListEntry[],
  today: string,
): NamedItem[] {
  const tallies = new Map<string, Tally>();
  for (const trip of history) {
    const weight = tripWeight(daysBetween(trip.day, today));
    const counted = new Set<Tally>();
    for (const thing of trip.items) {
      const key = thingKey(thing.item);
      let tally = tallies.get(key);
      if (tally === undefined) {
        tally = { thing, score: 0, trips: 0, lastDay: trip.day };
        tallies.set(key, tally);
      }
      // A thing twice in one trip still counts as one trip.
      if (counted.has(tally)) continue;
      counted.add(tally);
      tally.score += weight;
      tally.trips += 1;
      if (trip.day >= tally.lastDay) {
        tally.lastDay = trip.day;
        tally.thing = thing;
      }
    }
  }
  const onList = new Set(list.map((entry) => thingKey(entry.item)));
  return [...tallies.values()]
    .filter((t) => t.trips >= MIN_TRIPS)
    .filter((t) => !onList.has(thingKey(t.thing.item)))
    .sort((a, b) => b.score - a.score || b.lastDay.localeCompare(a.lastDay))
    .slice(0, MAX_SUGGESTIONS)
    .map((t) => t.thing);
}
