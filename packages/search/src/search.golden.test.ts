// Acceptance tests on the real Kupittaa catalogue (docs/plans/search.md §8). They read
// the committed output of `pnpm data:search`, so they change when the data does: run
// with `pnpm search:golden`, never as part of CI.
import { describe, expect, it, vi } from 'vitest';
import { createSearchEngine } from './engine';
import { fold } from './normalise';
import type { SearchResponse, TierData } from './types';

/** A file from data/build/core/; a dynamic path keeps TypeScript from typing megabytes of JSON. */
const read = async <T>(name: string): Promise<T> =>
  (
    (await import(`../../../data/build/core/${name}.json`, { with: { type: 'json' } })) as {
      default: T;
    }
  ).default;

const engine = createSearchEngine({
  categories: await read('categories'),
  categoryTop: await read('category-top'),
  categoryRank: await read('category-rank'),
  aliases: await read('aliases'),
  yieldFn: async () => {},
});
for (const tier of [1, 2, 3]) await engine.addTier(await read<TierData>(`search-tier-${tier}`));
// Three tiers, then the typo vocabulary the engine builds once they are all in.
await vi.waitFor(() => expect(engine.getVersion()).toBe(4));

const search = (raw: string) => engine.search(raw + ' ');
const names = (r: SearchResponse) => r.products.map((p) => fold(p.name));
const first = (r: SearchResponse) => names(r)[0] ?? '';
const categoryNames = (r: SearchResponse) => r.categories.map((c) => c.category.name);

describe('the §14 target: milk first', () => {
  it('ma: a milk is the first product', () => {
    expect(first(engine.search('ma'))).toMatch(/(^| )maito( |$)/);
  });

  it('maito: a 1 l milk first, and the milk category "Maidot", never a top-level one', () => {
    const r = search('maito');
    expect(first(r)).toMatch(/maito.* 1l( |$)/);
    // "Maidot" via the alias maito → maidot (Finnish t → d), not "Maitotuotteet" (cream)
    expect(categoryNames(r)[0]).toBe('Maidot');
    expect(r.categories[0]!.topProducts[0]?.name).toMatch(/maito/);
    expect(r.categories.every((c) => c.category.parentId !== undefined)).toBe(true);
  });

  it('maito: nothing dairy-free (the alias term =maidot matches the whole word only)', () => {
    const r = engine.search('maito ', 1000);
    expect(categoryNames(r)).not.toContain('Maidottomat jogurtit');
    expect(names(r).filter((name) => /maidoton|maidottom/.test(name))).toEqual([]);
  });
});

describe('Finnish compounds and folding', () => {
  it('leipä: bread first (leipä ends the word), and a bread category', () => {
    const r = search('leipä');
    expect(first(r)).toMatch(/leipä( |$)/);
    expect(categoryNames(r)).toContain('Leivät');
  });

  it('nakki never finds näkkileipä: å, ä and ö are letters of their own', () => {
    const r = engine.search('nakki ', 1000);
    expect(r.products.length).toBeGreaterThan(0);
    expect(names(r).filter((name) => name.includes('näkki'))).toEqual([]);
    expect(search('näkkileipä').products.length).toBeGreaterThan(0);
  });

  it('leipa (no ä) finds nothing itself, so typo correction offers leipä, labelled', () => {
    expect(search('leipa').corrected).toEqual({ from: 'leipa', to: 'leipä' });
  });

  it('juusto: no top-level category', () => {
    expect(search('juusto').categories.every((c) => c.category.parentId !== undefined)).toBe(true);
  });

  it('creme fraiche finds crème fraîche', () => {
    expect(first(search('creme fraiche'))).toContain('creme fraiche');
  });
});

describe('everyday products', () => {
  it('banaani: Pirkka banaani first, and the Banaanit category', () => {
    const r = search('banaani');
    expect(r.products[0]?.name).toBe('Pirkka banaani');
    expect(categoryNames(r)).toContain('Banaanit');
  });

  it('kahvi: a ground coffee first', () => {
    expect(first(search('kahvi'))).toMatch(/kahvi.*(jauh|suodatin)/);
  });

  it('hedelmät ja vihannekset: that category first', () => {
    expect(categoryNames(search('hedelmät ja vihannekset'))[0]).toBe('Hedelmät ja vihannekset');
  });
});

describe('aliases', () => {
  it('vessapaperi finds toilet paper', () => {
    const r = search('vessapaperi');
    expect(r.products.length).toBeGreaterThanOrEqual(5);
    expect(categoryNames(r)).toContain('WC-paperit');
  });

  it('kana finds every chicken product, kana itself included, but no eggs, carrots or sheets', () => {
    // aliases widen: "kana" is searched too, and -muna, -porkkana, -lakana… keep the rest out
    const all = engine.search('kana ', 2000);
    expect(all.products.map((p) => p.name)).toContain('Pirkka suomalainen kanan jauheliha 400g');
    expect(all.products.map((p) => p.name)).toContain('Hetki Suosikkisalaatti kana-caesar 230g');
    expect(names(all).filter((name) => /muna|munia|porkkana|lakana/.test(name))).toEqual([]);
    expect(categoryNames(all)).not.toContain('Kananmunat');
  });

  it('kana means chicken from the first keystroke, never eggs', () => {
    for (const raw of ['kana', 'kana ']) {
      const top = engine
        .search(raw)
        .products.slice(0, 5)
        .map((p) => fold(p.name));
      expect(top.some((name) => /muna|munia/.test(name))).toBe(false);
      expect(categoryNames(engine.search(raw))[0]).toBe('Broileri');
    }
  });

  it('kalja finds beer', () => {
    expect(categoryNames(search('kalja'))[0]).toBe('Oluet');
  });
});

describe('typo correction', () => {
  it.each([
    ['maiot', 'maito', /maito/],
    ['jauhelha', 'jauheliha', /jauheliha/],
    ['kahvli', 'kahvi', /kahvi/],
    ['banaanni', 'banaani', /banaani/],
  ])('%s is searched as %s', (typed, fixed, firstName) => {
    const r = search(typed);
    expect(r.corrected?.to).toBe(fixed);
    expect(first(r)).toMatch(firstName);
  });

  it('does not correct a word that already finds products', () => {
    expect(search('jogurtt').corrected).toBeUndefined();
  });
});

describe('several words', () => {
  it('maito laktoositon: every product has both words', () => {
    const r = search('maito laktoositon');
    expect(r.products.length).toBeGreaterThan(0);
    for (const name of names(r)) expect(name).toMatch(/maito.*laktoositon|laktoositon.*maito/);
  });

  it('maito l: every product has a word starting with l', () => {
    const r = search('maito l');
    expect(r.products.length).toBeGreaterThan(0);
    for (const name of names(r)) expect(name).toMatch(/(^| )l/);
  });
});

describe('tiers', () => {
  it.each(['maito', 'leipä', 'kahvi', 'pesuaine', 'sukat'])(
    '%s: results never go back to an earlier tier',
    (raw) => {
      const tiers = engine.search(raw, 200).products.map((p) => p.tier);
      expect(tiers).toEqual([...tiers].sort());
    },
  );
});
