import { describe, expect, it } from 'vitest';
import { fold, foldWithOffsets } from './normalise';

describe('fold', () => {
  it.each([
    ['Täysjyväruisleipä', 'taysjyvaruisleipa'],
    ['ÄÖÅ äöå', 'aoa aoa'],
    ['Valio Arki crème fraîche 12%', 'valio arki creme fraiche 12'],
    ['Jamón Serrano', 'jamon serrano'],
    ['Smørrebrød Æble Straße Œuf', 'smorrebrod aeble strasse oeuf'],
  ])('lowercases and removes accents: %s', (name, folded) => {
    expect(fold(name)).toBe(folded);
  });

  it('removes a decomposed accent (a + U+0308) like a precomposed ä', () => {
    expect(fold('leipa\u0308')).toBe(fold('leipä'));
    expect(fold('leipa\u0308')).toBe('leipa');
  });

  it.each([
    ['Fazer Leipurit Rustico-leipä 400g', 'fazer leipurit rustico leipa 400g'],
    ['Arki™juustoviipale 500 g n.36 kpl/pak', 'arki juustoviipale 500 g n 36 kpl pak'],
    ['Pirkka (luomu) & muut, 1,5l', 'pirkka luomu muut 1 5l'],
  ])('turns punctuation and symbols into single spaces: %s', (name, folded) => {
    expect(fold(name)).toBe(folded);
  });

  it.each([
    ["L'Oréal", 'loreal'],
    ['L´Oréal', 'loreal'],
    ['L’Oréal', 'loreal'],
    ['Fisherman´s Friend', 'fishermans friend'],
  ])('drops apostrophes instead of splitting the word: %s', (name, folded) => {
    expect(fold(name)).toBe(folded);
  });

  it('removes invisible characters inside words instead of splitting them', () => {
    expect(fold('kevyt\u200Bmaito')).toBe('kevytmaito');
    expect(fold('kevyt\u00ADmaito')).toBe('kevytmaito');
    expect(fold('\uFEFFmaito')).toBe('maito');
  });

  it('collapses runs of spaces and trims both ends', () => {
    expect(fold('  Pirkka   kevytmaito  1l ')).toBe('pirkka kevytmaito 1l');
    expect(fold('-- maito --')).toBe('maito');
  });

  it('returns an empty string when nothing is left', () => {
    expect(fold('')).toBe('');
    expect(fold(' ™ - / ')).toBe('');
  });

  it('only ever outputs a-z, 0-9 and single inner spaces', () => {
    const folded = fold('Ü×°²µ ⌀ 5×10cm — Dole hedelmÃ¤kupit ǀ Ø');
    expect(folded).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
  });

  it('is idempotent', () => {
    for (const name of ['Täysjyväruisleipä', 'crème fraîche', "L'Oréal", 'n.36 kpl/pak']) {
      expect(fold(fold(name))).toBe(fold(name));
    }
  });
});

describe('foldWithOffsets', () => {
  it('folds exactly like fold(), on both of its paths', () => {
    // fold() takes a whole-string fast path for printable ASCII + äöå and a per-character
    // loop otherwise; foldWithOffsets() always loops. Both kinds of name must agree.
    const simple = ['Täysjyväruisleipä', 'ÄÖÅ', 'Pirkka (luomu) & muut, 1,5l', "Fisherman's"];
    const other = ['Crème fraîche', "L'Oréal", 'L´Oréal', 'leipa\u0308', 'Æble', 'a\u200Bb'];
    for (const name of [...simple, ...other, 'tab\tseparated', '  a -- b ', '']) {
      expect(foldWithOffsets(name).folded).toBe(fold(name));
    }
  });

  it('maps every folded character back to its original index', () => {
    const name = 'Crème  fraîche';
    const { folded, origin } = foldWithOffsets(name);
    expect(folded).toBe('creme fraiche');
    expect(origin).toHaveLength(folded.length);
    // "è" folds to "e" at its own index; the collapsed space points at the next word.
    expect(origin.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(origin[5]).toBe(7);
    expect(name.slice(origin[6], origin[12]! + 1)).toBe('fraîche');
  });

  it('maps both letters of an expanded character to the same index', () => {
    expect(foldWithOffsets('Æb').origin).toEqual([0, 0, 1]);
  });

  it('skips dropped characters, so indexes jump over them', () => {
    expect(foldWithOffsets("L'O").origin).toEqual([0, 2]);
  });
});
