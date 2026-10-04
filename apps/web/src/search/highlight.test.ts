import type { MatchTerm } from '@pathfinder/search';
import { describe, expect, it } from 'vitest';
import { highlightRanges, splitByRanges } from './highlight';

const anywhere = (term: string): MatchTerm => ({ term, wordStart: false });
const wordStart = (term: string): MatchTerm => ({ term, wordStart: true });

/** The highlighted parts of `name`, as text. */
const lit = (name: string, terms: MatchTerm[]) =>
  highlightRanges(name, terms).map(([start, end]) => name.slice(start, end));

describe('highlightRanges', () => {
  it('finds a term inside a compound', () => {
    expect(lit('Pirkka kevytmaito 1l', [anywhere('maito')])).toEqual(['maito']);
  });

  it('lights up the original accented text', () => {
    const name = 'Valio Arki crème fraîche 12%';
    expect(lit(name, [anywhere('creme'), anywhere('fraiche')])).toEqual(['crème', 'fraîche']);
  });

  it('lights up an alias phrase across punctuation', () => {
    expect(lit('Lambi WC-paperi 8 rl', [anywhere('wc paperi')])).toEqual(['WC-paperi']);
  });

  it('lights up a 1–2 letter term only where it starts a word', () => {
    const name = 'Pirkka laktoositon kevytmaitojuoma 1l';
    expect(lit(name, [anywhere('maito'), wordStart('l')])).toEqual(['l', 'maito']);
  });

  it('lights up a whole-word term only where it is the whole word', () => {
    const wholeWord: MatchTerm = { term: 'maidot', wordStart: true, wholeWord: true };
    expect(lit('Maidot ja maidottomat jogurtit', [wholeWord])).toEqual(['Maidot']);
    expect(lit('Valio maidot', [wholeWord])).toEqual(['maidot']);
    expect(lit('kevytmaidot 1l', [wholeWord])).toEqual([]);
  });

  it('finds every occurrence, and merges terms that overlap or touch', () => {
    expect(lit('maito ja maito', [anywhere('maito')])).toEqual(['maito', 'maito']);
    expect(lit('kevytmaito', [anywhere('kevyt'), anywhere('ytmai')])).toEqual(['kevytmai']);
    expect(lit('kevytmaito', [anywhere('kevyt'), anywhere('maito')])).toEqual(['kevytmaito']);
  });

  it('keeps a separately written accent mark with its letter', () => {
    const name = 'Ruisleipa\u0308 400g';
    expect(lit(name, [anywhere('leipä')])).toEqual(['leipa\u0308']);
  });

  it('spans a dropped apostrophe', () => {
    expect(lit("L'Oréal Paris", [anywhere('loreal')])).toEqual(["L'Oréal"]);
  });

  it('returns nothing when no term appears', () => {
    expect(highlightRanges('Pirkka banaani', [anywhere('maito')])).toEqual([]);
    expect(highlightRanges('Pirkka banaani', [])).toEqual([]);
  });
});

describe('splitByRanges', () => {
  it('cuts the name into matched and unmatched runs, in order', () => {
    expect(splitByRanges('Pirkka kevytmaito 1l', [[12, 17]])).toEqual([
      { text: 'Pirkka kevyt', match: false },
      { text: 'maito', match: true },
      { text: ' 1l', match: false },
    ]);
  });

  it('handles matches at both ends, and no matches', () => {
    expect(splitByRanges('maito', [[0, 5]])).toEqual([{ text: 'maito', match: true }]);
    expect(splitByRanges('banaani', [])).toEqual([{ text: 'banaani', match: false }]);
  });
});
