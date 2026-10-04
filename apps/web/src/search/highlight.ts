import { foldWithOffsets, type MatchTerm } from '@pathfinder/search';

/** A run of the original name, `[start, end)`. */
export type Range = [start: number, end: number];

export type Segment = { text: string; match: boolean };

const COMBINING_MARK = /\p{M}/u;

/**
 * Where the matched terms appear in `name`, as ranges of the original text (merged where
 * they touch or overlap). Matching runs on the folded name, the same text the engine
 * searched, so "creme" lights up "crème" and the alias term "wc paperi" lights up
 * "WC-paperi". Only the 20 visible rows are highlighted, never the whole catalogue.
 */
export function highlightRanges(name: string, terms: readonly MatchTerm[]): Range[] {
  const { folded, origin } = foldWithOffsets(name);
  const hits: Range[] = [];
  for (const { term, wordStart, wholeWord } of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + 1)) {
      const end = at + term.length;
      if (wordStart && at > 0 && folded[at - 1] !== ' ') continue;
      if (wholeWord && end < folded.length && folded[end] !== ' ') continue;
      hits.push([at, end]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);

  const merged: Range[] = [];
  for (const [start, end] of hits) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.map(([start, end]) => {
    let to = origin[end - 1]! + 1;
    // Keep an accent written as a separate mark with its letter.
    while (to < name.length && COMBINING_MARK.test(name[to]!)) to++;
    return [origin[start]!, to];
  });
}

/** `name` cut into matched and unmatched runs, in order, for rendering. */
export function splitByRanges(name: string, ranges: readonly Range[]): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) segments.push({ text: name.slice(at, start), match: false });
    segments.push({ text: name.slice(start, end), match: true });
    at = end;
  }
  if (at < name.length) segments.push({ text: name.slice(at), match: false });
  return segments;
}
