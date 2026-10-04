import { compareStrings } from '@pathfinder/core';
import { CHUNK_SIZE, type Haystack, type YieldFn } from './haystack';

/** Only words this long are corrected; shorter ones have too many one-edit neighbours. */
export const MIN_TYPO_LENGTH = 5;
/** Vocabulary words shorter than this are skipped: they are never correction targets. */
const MIN_WORD_LENGTH = MIN_TYPO_LENGTH - 1;

/** Every distinct word in the catalogue with how often it occurs, bucketed by length. */
export type Vocabulary = ReadonlyMap<number, ReadonlyMap<string, number>>;

/**
 * Collects the words of every tier (docs/plans/search.md §5, step 9). Built in chunks
 * after tier 3 has loaded, never during a keystroke: on an old phone it is a few hundred
 * milliseconds of work in total.
 */
export async function buildVocabulary(
  haystacks: readonly Haystack[],
  yieldFn: YieldFn,
): Promise<Vocabulary> {
  const byLength = new Map<number, Map<string, number>>();
  for (const { text, starts, size } of haystacks) {
    for (let i = 0; i < size; i++) {
      if (i > 0 && i % CHUNK_SIZE === 0) await yieldFn();
      for (const word of text.slice(starts[i]! + 1, starts[i + 1]! - 1).split(' ')) {
        if (word.length < MIN_WORD_LENGTH) continue;
        let bucket = byLength.get(word.length);
        if (!bucket) byLength.set(word.length, (bucket = new Map()));
        bucket.set(word, (bucket.get(word) ?? 0) + 1);
      }
    }
  }
  return byLength;
}

/**
 * The catalogue word one edit away from `word` (a letter changed, added, removed, or two
 * neighbouring letters swapped: `miato` → `maito`), preferring the most frequent, then
 * the alphabetically first. `null` when the word is short, already known, or has none.
 */
export function correctWord(word: string, vocabulary: Vocabulary): string | null {
  if (word.length < MIN_TYPO_LENGTH || vocabulary.get(word.length)?.has(word)) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const length of [word.length - 1, word.length, word.length + 1]) {
    for (const [candidate, count] of vocabulary.get(length) ?? []) {
      // Typos rarely hit the first letter; checking it first skips ~95% of the words.
      // The second letter covers a swap of the first two (`amito` → `maito`).
      if (candidate[0] !== word[0] && candidate[0] !== word[1]) continue;
      if (!withinOneEdit(word, candidate)) continue;
      if (count > bestCount || (count === bestCount && compareStrings(candidate, best!) < 0)) {
        best = candidate;
        bestCount = count;
      }
    }
  }
  return best;
}

/** Whether `a` and `b` differ by at most one edit (Damerau: a swap counts as one). */
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (i === a.length) return true;
    // One substitution, or one swap of neighbours.
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    );
  }
  // One insertion or deletion at the first difference.
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
