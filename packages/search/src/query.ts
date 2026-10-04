import { fold } from './normalise';
import type { Aliases } from './types';

/** Words beyond this are ignored; nobody types seven words into a shopping search. */
export const MAX_WORDS = 6;
/** Words of 1–2 letters match word starts only; `m` anywhere matches almost everything. */
export const WORD_START_MAX_LENGTH = 2;
/** The word being typed picks up aliases by prefix only from this length on. */
export const ALIAS_PREFIX_MIN_LENGTH = 4;
/** Category results need at least one word this long (`m` matches 410 category names). */
export const CATEGORY_MIN_LENGTH = 3;

export type MatchMode = 'word-start' | 'anywhere';

export type Alternative = {
  term: string;
  mode: MatchMode;
  /** What to `indexOf` in a haystack: `" " + term` for word-start, `term` otherwise. */
  needle: string;
};

/** One query word: an item matches the slot if it matches any alternative (OR). */
export type Slot = { word: string; alternatives: Alternative[] };

/** An item matches the query if it matches every slot (AND). */
export type ParsedQuery = {
  slots: Slot[];
  categoryEligible: boolean;
  isEmpty: boolean;
};

/** Aliases with folded keys and terms, prepared once when the engine is created. */
export type PreparedAliases = ReadonlyMap<string, readonly string[]>;

export function prepareAliases(aliases: Aliases): PreparedAliases {
  const prepared = new Map<string, string[]>();
  for (const [key, terms] of Object.entries(aliases)) {
    prepared.set(
      fold(key),
      terms.map(fold).filter((term) => term !== ''),
    );
  }
  return prepared;
}

/** Turns what the shopper typed into slots (docs/plans/search.md §5.2–5.3). */
export function parseQuery(raw: string, aliases: PreparedAliases): ParsedQuery {
  const typed = fold(raw).split(' ').filter(Boolean);
  const words = [...new Set(typed)].slice(0, MAX_WORDS);
  // The last word is still being typed unless the query ends with a space.
  const typing = /\s$/.test(raw) ? undefined : typed.at(-1);

  const slots = words.map((word, i) => {
    const isTyping = word === typing && i === words.length - 1;
    return { word, alternatives: subsume(expand(word, isTyping, aliases).map(toAlternative)) };
  });
  return {
    slots,
    categoryEligible: words.some((word) => word.length >= CATEGORY_MIN_LENGTH),
    isEmpty: slots.length === 0,
  };
}

/** The terms a word stands for: its exact alias, which replaces it; otherwise itself,
 * plus the aliases of longer keys it is a prefix of, while it is being typed. A word with
 * its own alias means that alias from the first keystroke: "kana" is chicken, not the
 * start of "kananmuna", so the results do not change when the space is typed. */
function expand(word: string, isTyping: boolean, aliases: PreparedAliases): string[] {
  const exact = aliases.get(word);
  if (exact) return [...new Set(exact)];
  const terms = [word];
  if (isTyping && word.length >= ALIAS_PREFIX_MIN_LENGTH) {
    for (const [key, keyTerms] of aliases) {
      if (key !== word && key.startsWith(word)) terms.push(...keyTerms);
    }
  }
  return [...new Set(terms)];
}

function toAlternative(term: string): Alternative {
  const mode: MatchMode = term.length <= WORD_START_MAX_LENGTH ? 'word-start' : 'anywhere';
  return { term, mode, needle: mode === 'word-start' ? ' ' + term : term };
}

/** Drops alternatives that another alternative already matches a superset of, so the
 * scan follows fewer cursors. */
function subsume(alternatives: Alternative[]): Alternative[] {
  return alternatives.filter((a) => !alternatives.some((b) => b !== a && covers(b, a)));
}

/** Whether every item `a` matches is also matched by `b`. */
function covers(b: Alternative, a: Alternative): boolean {
  if (b.mode === 'anywhere') return a.term.includes(b.term);
  // A word-start match of `b` needs " b" in the item; " a" must contain it.
  return a.mode === 'word-start' && a.needle.includes(b.needle);
}
