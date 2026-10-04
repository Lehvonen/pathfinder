import type { Category } from '@pathfinder/core';
import { fold } from './normalise';
import type { Alternative, ParsedQuery } from './query';
import type { CategoryRank } from './types';

/** Category results shown above the products, at most. */
export const MAX_CATEGORIES = 3;

export type CategoryIndex = {
  /** Categories whose name matches, most specific first (docs/plans/search.md §4). */
  match(query: ParsedQuery): Category[];
  /** `mask[id] === 1` for the category and every descendant. */
  subtreeMask(id: number): Uint8Array;
  children(id: number): Category[];
};

type Entry = {
  category: Category;
  folded: string;
  /** `" " + folded`, so a word-start check is one `includes`; built once, not per keystroke. */
  spaced: string;
  ancestors: number[];
  rank: number;
};
type Scored = Entry & { score: number };

export function createCategoryIndex(
  categories: readonly Category[],
  categoryRank: CategoryRank,
): CategoryIndex {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const childrenOf = new Map<number, Category[]>();
  for (const c of categories) {
    if (c.parentId !== undefined) {
      childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c]);
    }
  }
  const ancestors = (c: Category): number[] => {
    const parent = c.parentId === undefined ? undefined : byId.get(c.parentId);
    return parent ? [parent.id, ...ancestors(parent)] : [];
  };
  // Categories with no products have no rank and are never offered: browsing them is empty.
  const entries: Entry[] = categories
    .filter((c) => categoryRank[c.id] !== undefined)
    .map((c) => ({
      category: c,
      folded: fold(c.name),
      spaced: ' ' + fold(c.name),
      ancestors: ancestors(c),
      rank: categoryRank[c.id]!,
    }));

  const maxId = Math.max(0, ...categories.map((c) => c.id));
  const masks = new Map<number, Uint8Array>();
  const subtreeMask = (id: number): Uint8Array => {
    let mask = masks.get(id);
    if (!mask) {
      mask = new Uint8Array(maxId + 1);
      const mark = (c: number) => {
        mask![c] = 1;
        for (const child of childrenOf.get(c) ?? []) mark(child.id);
      };
      mark(id);
      masks.set(id, mask);
    }
    return mask;
  };

  const match = (query: ParsedQuery): Category[] => {
    if (!query.categoryEligible) return [];
    const terms = prepareTerms(query);
    const matched: Scored[] = [];
    for (const entry of entries) {
      const score = scoreName(entry, terms);
      if (score > 0) matched.push({ ...entry, score });
    }
    // An ancestor gives way to a matched descendant that scores at least as well, so
    // "maito" offers "Maitotuotteet", not the whole dairy department.
    const kept = matched.filter(
      (a) => !matched.some((d) => d.score >= a.score && d.ancestors.includes(a.category.id)),
    );
    kept.sort(
      (a, b) =>
        b.score - a.score ||
        b.ancestors.length - a.ancestors.length ||
        a.rank - b.rank ||
        a.category.id - b.category.id,
    );
    return kept.slice(0, MAX_CATEGORIES).map((e) => e.category);
  };

  return { match, subtreeMask, children: (id) => childrenOf.get(id) ?? [] };
}

/** A query's alternatives in the form the name check needs, built once per keystroke. */
type QueryTerms = {
  phrase: string;
  slots: { needle: string; inSpaced: boolean; atWordStart: string; term: string }[][];
};

function prepareTerms(query: ParsedQuery): QueryTerms {
  return {
    phrase: query.slots.map((s) => s.word).join(' '),
    slots: query.slots.map((s) =>
      s.alternatives.map((a: Alternative) => ({
        needle: a.needle,
        inSpaced: a.mode === 'word-start',
        atWordStart: ' ' + a.term,
        term: a.term,
      })),
    ),
  };
}

/**
 * 3: the name is exactly the query (or, for one word, exactly one of its aliases);
 * 2: every word matches at a word start; 1: every word matches; 0: no match.
 */
function scoreName({ folded, spaced }: Entry, { phrase, slots }: QueryTerms): number {
  const matches = slots.every((alts) =>
    alts.some((a) => (a.inSpaced ? spaced : folded).includes(a.needle)),
  );
  if (!matches) return 0;
  const exact =
    folded === phrase || (slots.length === 1 && slots[0]!.some((a) => a.term === folded));
  if (exact) return 3;
  const atWordStart = slots.every((alts) => alts.some((a) => spaced.includes(a.atWordStart)));
  return atWordStart ? 2 : 1;
}
