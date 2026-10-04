import { describe, expect, it } from 'vitest';
import { aliases } from './fixtures';
import {
  MAX_WORDS,
  parseQuery,
  prepareAliases,
  type ParsedQuery,
  type PreparedAliases,
} from './query';
import type { Aliases } from './types';

const prepared = prepareAliases(aliases);
const parse = (raw: string, using: PreparedAliases = prepared) => parseQuery(raw, using);

const words = (q: ParsedQuery) => q.slots.map((s) => s.word);
const terms = (q: ParsedQuery, slot = 0) => q.slots[slot]!.alternatives.map((a) => a.term);

describe('parseQuery', () => {
  it('is empty for an empty or blank query', () => {
    for (const raw of ['', '   ', ' - / ']) {
      expect(parse(raw)).toEqual({ slots: [], categoryEligible: false, isEmpty: true });
    }
  });

  it('folds the query and splits it into words', () => {
    expect(words(parse('  Kevytmaito  1L '))).toEqual(['kevytmaito', '1l']);
    expect(words(parse('crème-fraîche'))).toEqual(['creme', 'fraiche']);
  });

  it('matches words of 2 letters at word starts and words of 3 letters anywhere', () => {
    expect(parse('ma').slots[0]!.alternatives).toEqual([
      { term: 'ma', mode: 'word-start', needle: ' ma' },
    ]);
    expect(parse('mai').slots[0]!.alternatives).toEqual([
      { term: 'mai', mode: 'anywhere', needle: 'mai' },
    ]);
  });

  it('decides the mode per word, so a short second word narrows', () => {
    const modes = parse('maito l').slots.map((s) => s.alternatives[0]!.mode);
    expect(modes).toEqual(['anywhere', 'word-start']);
  });

  it('allows category results only once a word has 3 letters', () => {
    expect(parse('ma l').categoryEligible).toBe(false);
    expect(parse('ma lei').categoryEligible).toBe(true);
  });

  it('drops repeated words', () => {
    expect(words(parse('maito Maito maito'))).toEqual(['maito']);
  });

  it(`keeps ${MAX_WORDS} words and ignores the rest`, () => {
    expect(parse('a1 a2 a3 a4 a5 a6').slots).toHaveLength(MAX_WORDS);
    expect(words(parse('a1 a2 a3 a4 a5 a6 a7'))).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });
});

describe('parseQuery aliases', () => {
  it('replaces a completed word that has an exact alias', () => {
    expect(terms(parse('vessapaperi '))).toEqual(['wc paperi', 'talouspaperi']);
  });

  it('keeps the word itself when the alias lists it', () => {
    expect(terms(parse('Leipä '))).toEqual(['leivat', 'leipa']);
  });

  it('adds aliases of longer keys while a word of 4+ letters is being typed', () => {
    expect(terms(parse('vessap'))).toEqual(['vessap', 'wc paperi', 'talouspaperi']);
  });

  it('does not add prefix aliases to a word of 3 letters', () => {
    expect(terms(parse('ves'))).toEqual(['ves']);
  });

  it('does not add prefix aliases once the word is completed', () => {
    expect(terms(parse('vessap '))).toEqual(['vessap']);
  });

  it('adds prefix aliases only to the last word', () => {
    const q = parse('vessap maito');
    expect(terms(q, 0)).toEqual(['vessap']);
    expect(terms(q, 1)).toEqual(['maito']);
  });

  it('does not treat an earlier copy of the typed word as being typed', () => {
    // "vessap" is the typed word, but deduplication keeps it in first place only.
    expect(terms(parse('vessap maito vessap'), 0)).toEqual(['vessap']);
  });
});

describe('parseQuery subsumption', () => {
  const custom = (a: Aliases) => prepareAliases(a);

  it('drops an anywhere term that contains another anywhere term', () => {
    // typing "leip" also brings in leipä's aliases; "leipa" contains "leip"
    expect(terms(parse('leip'))).toEqual(['leip', 'leivat']);
    expect(terms(parse('x ', custom({ x: ['kevyt', 'kevytmaito'] })))).toEqual(['kevyt']);
  });

  it('drops a word-start term whose needle contains another word-start needle', () => {
    expect(terms(parse('x ', custom({ x: ['k', 'ke'] })))).toEqual(['k']);
  });

  it('keeps an anywhere term even when a word-start term is its prefix', () => {
    // " ke" at a word start does not match the "kevyt" inside "luomukevytmaito"
    expect(terms(parse('x ', custom({ x: ['ke', 'kevyt'] })))).toEqual(['ke', 'kevyt']);
  });

  it('keeps a word-start term even when an anywhere term contains it', () => {
    // "wc" matches only at a word start; the phrase "wc paperi" can match mid-word
    expect(terms(parse('x ', custom({ x: ['wc', 'xwc paperi'] })))).toEqual(['wc', 'xwc paperi']);
  });
});

describe('prepareAliases', () => {
  it('folds keys and terms and drops terms that fold to nothing', () => {
    expect([...prepareAliases({ Leipä: ['Leivät', '—'] })]).toEqual([['leipa', ['leivat']]]);
  });
});
