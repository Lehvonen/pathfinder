import { afterEach, describe, expect, it, vi } from 'vitest';
import { aliases, tiers } from './fixtures';
import { buildHaystack } from './haystack';
import { parseQuery, prepareAliases, type PreparedAliases } from './query';
import { scan } from './scan';

const noYield = async () => {};
const prepared = prepareAliases(aliases);
const parse = (raw: string, using: PreparedAliases = prepared) => parseQuery(raw, using);

// Tier 1, folded:
//  0 pirkka banaani                     6 fazer puikula ruisleipa 9kpl 500g
//  1 pirkka suomalainen kevytmaito 1l   7 valio maitorahka 250g
//  2 pirkka laktoositon kevytmaitojuoma 8 chiquita banaani
//  3 pirkka suomalainen rasvaton maito  9 pirkka kermajuusto 1 kg laktoositon
//  4 vaasan ruispalat … taysjyvaruisleipa 10 valio arki creme fraiche 12
//  5 pirkka leipajuusto 310g laktoositon 11 pirkka luomu maito 1l
const tier1 = await buildHaystack(tiers[1].names, noYield);
const tier3 = await buildHaystack(tiers[3].names, noYield);

describe('scan', () => {
  it('returns every matching item in order, compounds included', () => {
    expect(scan(tier1, parse('maito'), 0, 20)).toEqual({ items: [1, 2, 3, 7, 11], next: null });
  });

  it('stops at the limit and resumes from next without repeating or skipping', () => {
    const query = parse('maito');
    expect(scan(tier1, query, 0, 2)).toEqual({ items: [1, 2], next: 3 });
    expect(scan(tier1, query, 3, 2)).toEqual({ items: [3, 7], next: 8 });
    expect(scan(tier1, query, 8, 2)).toEqual({ items: [11], next: null });
  });

  it('returns next: null when the limit is reached on the tier’s last item', () => {
    expect(scan(tier1, parse('maito'), 0, 5)).toEqual({ items: [1, 2, 3, 7, 11], next: null });
  });

  it('matches a 1–2 letter word at word starts only', () => {
    expect(scan(tier1, parse('le'), 0, 20).items).toEqual([5]);
    expect(scan(tier1, parse('lei'), 0, 20).items).toEqual([4, 5, 6]);
  });

  it('skips mid-word occurrences of a short word, within an item and across items', async () => {
    const h = await buildHaystack(
      ['kevytmaito 1l', 'kevytmaito maito', 'valio maitorahka'],
      noYield,
    );
    expect(scan(h, parse('ma'), 0, 20).items).toEqual([1, 2]);
  });

  it('matches a word at the start of the first item', () => {
    expect(scan(tier1, parse('pi'), 0, 20).items).toEqual([0, 1, 2, 3, 5, 9, 11]);
  });

  it('requires every word to match (AND)', () => {
    expect(scan(tier1, parse('maito laktoositon'), 0, 20).items).toEqual([2]);
    // "l" must start a word: "laktoositon" and "luomu" match, the "1l" of 1 and 3 does not
    expect(scan(tier1, parse('pirkka maito l'), 0, 20).items).toEqual([2, 11]);
  });

  it('accepts any alternative of a word (OR), including a phrase', () => {
    expect(scan(tier3, parse('vessapaperi '), 0, 20).items).toEqual([0, 1]);
  });

  it('counts an item once when it matches several times', () => {
    const using = prepareAliases({ x: ['kevytmaito', 'maitojuoma'] });
    expect(scan(tier1, parse('x ', using), 0, 20).items).toEqual([1, 2]);
  });

  it('returns nothing when a word matches nothing', () => {
    expect(scan(tier1, parse('xyzq'), 0, 20)).toEqual({ items: [], next: null });
    expect(scan(tier1, parse('maito xyzq'), 0, 20)).toEqual({ items: [], next: null });
  });

  it('matches every item for an empty query', () => {
    expect(scan(tier1, parse(''), 4, 3)).toEqual({ items: [4, 5, 6], next: 7 });
    expect(scan(tier1, parse(''), 10, 5)).toEqual({ items: [10, 11], next: null });
  });

  it('skips items the filter rejects without ending the scan', () => {
    const milks = (i: number) => tiers[1].categoryIds[i] === 3;
    expect(scan(tier1, parse('maito'), 0, 20, milks).items).toEqual([1, 2, 3, 11]);
    expect(scan(tier1, parse(''), 0, 2, milks)).toEqual({ items: [1, 2], next: 3 });
  });

  it('returns nothing when starting at or past the end', () => {
    expect(scan(tier1, parse('maito'), tier1.size, 20)).toEqual({ items: [], next: null });
  });
});

describe('scan exclusions', () => {
  it('leaves out matching items that contain an excluded text, without ending the scan', async () => {
    const h = await buildHaystack(
      ['Pirkka kana', 'Pirkka vapaan kanan munia', 'Pirkka porkkana 1kg', 'Kana-caesar salaatti'],
      noYield,
    );
    const using = prepareAliases({ kana: ['-muna', '-munia', '-porkkana'] });
    expect(scan(h, parse('kana ', using), 0, 20).items).toEqual([0, 3]);
    expect(scan(h, parse('kana ', using), 0, 1)).toEqual({ items: [0], next: 1 });
  });
});

describe('scan cost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Every indexOf call on the haystack text, as [needle, fromIndex]. */
  const spyOnSeeks = () => {
    const spy = vi.spyOn(String.prototype, 'indexOf');
    return () =>
      spy.mock.calls
        .filter((_, i) => String(spy.mock.contexts[i]) === tier1.text)
        .map(([needle, fromIndex]) => [needle, fromIndex] as const);
  };

  it('ends after one seek per word when the second word is absent', () => {
    // The first draft re-checked "xyzq" for every "maito" match (review blocker 2).
    const seeks = spyOnSeeks();
    scan(tier1, parse('maito xyzq'), 0, 20);
    expect(seeks().map(([needle]) => needle)).toEqual(['maito', 'xyzq']);
  });

  it('never searches for a needle that starts with a space', () => {
    // " xy" would stop at every space in the text; "xy" plus a space check is ~30× faster
    const seeks = spyOnSeeks();
    scan(tier1, parse('maito xy'), 0, 20);
    scan(tier1, parse('pi le'), 0, 20);
    expect(seeks().filter(([needle]) => String(needle).startsWith(' '))).toEqual([]);
  });

  it('only ever moves each cursor forward', () => {
    const seeks = spyOnSeeks();
    scan(tier1, parse('pirkka laktoositon'), 0, 20);
    const byNeedle = new Map<string, number[]>();
    for (const [needle, from] of seeks()) {
      byNeedle.set(needle, [...(byNeedle.get(needle) ?? []), from ?? 0]);
    }
    for (const froms of byNeedle.values()) {
      expect(froms).toEqual([...froms].sort((a, b) => a - b));
      expect(new Set(froms).size).toBe(froms.length);
    }
  });
});
