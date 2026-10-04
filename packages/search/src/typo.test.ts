import { describe, expect, it, vi } from 'vitest';
import { tiers } from './fixtures';
import { buildHaystack, CHUNK_SIZE } from './haystack';
import { buildVocabulary, correctWord, MIN_TYPO_LENGTH, withinOneEdit } from './typo';

const noYield = async () => {};
const vocabularyOf = async (...names: string[][]) =>
  buildVocabulary(await Promise.all(names.map((n) => buildHaystack(n, noYield))), noYield);

describe('withinOneEdit', () => {
  it.each([
    ['maito', 'maito', 'the same word'],
    ['maito', 'maitu', 'one letter changed'],
    ['maito', 'maitto', 'one letter added'],
    ['maitto', 'maito', 'one letter removed'],
    ['miato', 'maito', 'two neighbours swapped'],
    ['maiot', 'maito', 'the last two letters swapped'],
    ['aito', 'maito', 'a letter added at the start'],
    ['maito', 'maitos', 'a letter added at the end'],
  ])('accepts %s → %s (%s)', (a, b) => {
    expect(withinOneEdit(a, b)).toBe(true);
  });

  it.each([
    ['maito', 'mauti', 'two letters changed'],
    ['maito', 'maitoja', 'two letters added'],
    ['maito', 'otiam', 'reversed'],
    ['mitao', 'maito', 'a letter moved two places'],
    ['mtiao', 'maito', 'a swap and a change'],
  ])('rejects %s → %s (%s)', (a, b) => {
    expect(withinOneEdit(a, b)).toBe(false);
  });
});

describe('buildVocabulary', () => {
  it('counts every word of 4+ letters across tiers, by length', async () => {
    const vocabulary = await vocabularyOf(['Pirkka maito 1l', 'Valio maito'], ['Pirkka leipä']);
    expect(vocabulary.get(5)).toEqual(
      new Map([
        ['maito', 2],
        ['valio', 1],
        ['leipä', 1],
      ]),
    );
    expect(vocabulary.get(6)).toEqual(new Map([['pirkka', 2]]));
    expect(vocabulary.get(2)).toBeUndefined();
  });

  it('yields between chunks of products', async () => {
    const names = Array.from({ length: 2 * CHUNK_SIZE + 1 }, (_, i) => `tuote ${i}`);
    const yieldFn = vi.fn(noYield);
    await buildVocabulary([await buildHaystack(names, noYield)], yieldFn);
    expect(yieldFn).toHaveBeenCalledTimes(2);
  });
});

describe('correctWord', () => {
  // maito ×3, maitu ×1, kaito ×1; leipa; banaani
  const ready = vocabularyOf(
    ['maito', 'maito', 'maito', 'maitu', 'kaito', 'leipa'],
    tiers[1].names,
  );

  it('corrects a swap to the catalogue word', async () => {
    const vocabulary = await ready;
    expect(correctWord('miato', vocabulary)).toBe('maito');
    expect(correctWord('banani', vocabulary)).toBe('banaani');
  });

  it('corrects a swap of the first two letters, but not a changed first letter', async () => {
    expect(correctWord('amito', await ready)).toBe('maito');
    expect(correctWord('naito', await vocabularyOf(['maito']))).toBeNull();
  });

  it('prefers the most frequent candidate', async () => {
    // "maiti" is one edit from both maito (×3, plus the fixture tier) and maitu (×1)
    expect(correctWord('maiti', await ready)).toBe('maito');
  });

  it('breaks a frequency tie alphabetically', async () => {
    const tie = await vocabularyOf(['harpa', 'harja']);
    expect(correctWord('harxa', tie)).toBe('harja');
  });

  it(`leaves words shorter than ${MIN_TYPO_LENGTH} letters alone, and corrects from ${MIN_TYPO_LENGTH}`, async () => {
    const small = await vocabularyOf(['leipa', 'leip']);
    expect(correctWord('lepi', small)).toBeNull();
    expect(correctWord('lepia', small)).toBe('leipa');
  });

  it('returns null for a word the catalogue already has, or with nothing one edit away', async () => {
    expect(correctWord('maito', await ready)).toBeNull();
    expect(correctWord('xyzzyq', await ready)).toBeNull();
  });
});
