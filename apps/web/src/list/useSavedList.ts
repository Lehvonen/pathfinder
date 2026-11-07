import { useEffect, useReducer } from 'react';
import { loadList, saveList } from './listStorage';
import { listReducer } from './listState';

/**
 * The list's reducer, started from the list saved on this device and saved again after
 * every change, so a refresh does not empty it (docs/plans/device-storage.md §2). The first
 * save, on start, writes back the list as it was read: rows dropped as unusable are gone
 * for good, and stale ticks stay cleared.
 */
export function useSavedList() {
  const [list, dispatch] = useReducer(listReducer, undefined, () => loadList());
  useEffect(() => {
    saveList(list);
  }, [list]);
  return [list, dispatch] as const;
}
