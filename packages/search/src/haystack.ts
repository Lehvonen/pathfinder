import { fold } from './normalise';

/**
 * One tier's names, folded and joined into a single string, so a query is a handful of
 * `indexOf` calls with no allocation per product (docs/plans/search.md §5.3):
 *
 *     "\n" + " " + fold(name0) + "\n" + " " + fold(name1) + "\n" + …
 *
 * Every item starts with a space, so a word-start needle is always `" " + word` and a
 * match of it belongs to the item it starts in. Folded names contain only `[a-z0-9 ]`,
 * so no needle can match across the `\n` between two items.
 */
export type Haystack = {
  text: string;
  /**
   * `starts[i]` is the index of item `i`'s leading space; length `size + 1`, with the
   * sentinel `starts[size] === text.length`. Item `i` ends at its `\n`, `starts[i + 1] - 1`.
   */
  starts: Uint32Array;
  size: number;
};

/** Names folded per chunk before yielding to the main thread, so typing never freezes. */
export const CHUNK_SIZE = 2000;

export type YieldFn = () => Promise<void>;

/**
 * Builds a haystack, yielding between chunks of names. The haystack is returned only
 * when complete, so a half-built tier is never searched.
 */
export async function buildHaystack(
  names: readonly string[],
  yieldFn: YieldFn = yieldToMain,
): Promise<Haystack> {
  const size = names.length;
  const starts = new Uint32Array(size + 1);
  const parts = new Array<string>(size);
  let position = 1; // after the leading "\n"
  for (let i = 0; i < size; i++) {
    if (i > 0 && i % CHUNK_SIZE === 0) await yieldFn();
    const part = ' ' + fold(names[i]!);
    parts[i] = part;
    starts[i] = position;
    position += part.length + 1; // the item and its "\n"
  }
  starts[size] = position;
  const text = size === 0 ? '\n' : '\n' + parts.join('\n') + '\n';
  return { text, starts, size };
}

/**
 * The item that contains `position`, or -1 for the leading `\n` (never part of an item,
 * and never matched by a needle). Binary search: ~16 steps for the largest tier.
 */
export function itemAt(haystack: Haystack, position: number): number {
  let low = 0;
  let high = haystack.size - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (haystack.starts[mid]! <= position) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Lets the browser handle input between chunks: `scheduler.yield` where it exists. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
