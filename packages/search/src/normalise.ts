/**
 * Text normalisation shared by product names and queries (docs/plans/search.md §5.1).
 * The output alphabet is `[a-z0-9äöå ]` with single spaces and no leading or trailing
 * space; the haystack relies on that (no `\n` inside a name, a word start is always
 * preceded by a space).
 *
 * å, ä and ö are letters of their own in Finnish, never folded: `nakki` (sausage) must not
 * find `näkkileipä` (crispbread). Every other accent is removed, so `creme` finds `crème`.
 */

/** Invisible characters inside words: zero-width spaces and joiners, BOM, soft hyphen. */
const INVISIBLE = /[\u00AD\u200B-\u200D\uFEFF]/;
/** Apostrophes are dropped so `L´Oréal` folds to `loreal`, not `l oreal`. */
const APOSTROPHE = /['`´‘’]/;
const COMBINING_MARK = /\p{M}/gu;
/** Combining marks that make å, ä and ö from a plain a or o written before them. */
const FINNISH_MARKS = /[\u0308\u030A]/;
const FINNISH_LETTERS = 'äöå';
/** Letters that NFD does not decompose. */
const LETTERS: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
};

export type FoldedText = {
  folded: string;
  /** `origin[k]` is the index in the original text of folded character `k`. */
  origin: number[];
};

/** Text that needs no per-character work: printable ASCII plus the Finnish letters. */
const SIMPLE = /^[ -~äöåÄÖÅ]*$/;

/** Folds `text` for matching: `Crème fraîche 12%` → `creme fraiche 12`, `Näkkileipä` →
 * `näkkileipä`. */
export function fold(text: string): string {
  // Whole-string fast path for ~99% of names; about 4× faster than the loop at load.
  if (!SIMPLE.test(text)) return foldInto(text, null);
  return text
    .toLowerCase()
    .replace(/['`]/g, '')
    .replace(/[^a-z0-9äöå]+/g, ' ')
    .trim();
}

/** `fold()` plus where each folded character came from, for highlighting. */
export function foldWithOffsets(text: string): FoldedText {
  const origin: number[] = [];
  return { folded: foldInto(text, origin), origin };
}

function foldInto(text: string, origin: number[] | null): string {
  let out = '';
  let pendingSpace = false;

  const emit = (letter: string, index: number) => {
    if (isWordChar(letter)) {
      if (pendingSpace && out !== '') {
        out += ' ';
        origin?.push(index);
      }
      pendingSpace = false;
      out += letter;
      origin?.push(index);
    } else if (!APOSTROPHE.test(letter)) {
      pendingSpace = true;
    }
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    // A plain a or o followed by a separate ¨ or ˚ is written-out ä, ö or å: keep it.
    const next = text[i + 1];
    if (next !== undefined && FINNISH_MARKS.test(next)) {
      const composed = (char + next).normalize('NFC').toLowerCase();
      if (FINNISH_LETTERS.includes(composed)) {
        emit(composed, i);
        i++;
        continue;
      }
    }
    // ASCII fast path: most characters of most names.
    if (char.charCodeAt(0) < 128) emit(char.toLowerCase(), i);
    else for (const letter of foldChar(char)) emit(letter, i);
  }
  return out;
}

/** One non-ASCII character → zero or more characters, lowercase, accents removed except
 * on å, ä and ö. */
function foldChar(char: string): string {
  if (INVISIBLE.test(char)) return '';
  const lower = char.toLowerCase();
  if (FINNISH_LETTERS.includes(lower)) return lower;
  const mapped = LETTERS[lower];
  if (mapped !== undefined) return mapped;
  return lower.normalize('NFD').replace(COMBINING_MARK, '');
}

function isWordChar(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || FINNISH_LETTERS.includes(char)
  );
}
