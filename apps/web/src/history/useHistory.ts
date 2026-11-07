import { useEffect, useState } from 'react';
import type { ListEntry } from '../list/listState';
import { type Consent, dayOf, type Trip, tripToRecord } from './history';
import {
  forgetHistory,
  loadConsent,
  loadHistory,
  recordTrip,
  saveConsent,
  tidyHistory,
} from './historyStorage';

/**
 * The purchase history for `App.tsx` (docs/plans/device-storage.md §3): the shopper's
 * answer, the trips, and what can be done with them. Everything stays on the device.
 * Trips are only read with a "yes"; on start, what is saved is made to match the answer.
 */
export function useHistory() {
  const [consent, setConsent] = useState<Consent>(() => loadConsent());
  const [trips, setTrips] = useState<readonly Trip[]>(() =>
    consent === 'yes' ? loadHistory(dayOf(new Date())) : [],
  );

  useEffect(() => {
    tidyHistory(dayOf(new Date()));
  }, []);

  return {
    consent,
    trips,
    /** "Kyllä" or "Ei kiitos" on the finish card; "Älä muista" is "no" too. */
    answer(next: 'yes' | 'no') {
      saveConsent(next);
      setConsent(next);
      if (next === 'no') setTrips([]);
    },
    /**
     * On "Valmis": records the ticked items, if the shopper agreed. If another tab has said
     * "no" since, nothing is saved, and this tab follows that answer.
     */
    record(list: readonly ListEntry[]) {
      const today = dayOf(new Date());
      const trip = tripToRecord(consent, list, today);
      if (trip === null) return;
      const saved = recordTrip(trip, today);
      setTrips(saved.history);
      setConsent(saved.consent ?? consent);
    },
    /** "Unohda ostohistoria": deletes the trips; recording carries on from the next one. */
    forget() {
      forgetHistory();
      setTrips([]);
    },
  };
}
