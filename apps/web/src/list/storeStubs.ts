import type { ListStore } from './listStorage';

/** For tests: a stand-in for `localStorage`, holding strings in a map. */
export function memoryStore(): ListStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** For tests: a store whose every call throws, like blocked site data or a full quota. */
export const brokenStore: ListStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};
