import { afterEach, describe, expect, it, vi } from 'vitest';
import { tiers } from './fixtures';
import { buildHaystack, CHUNK_SIZE, itemAt, yieldToMain, type Haystack } from './haystack';

const noYield = async () => {};
const build = (names: readonly string[]) => buildHaystack(names, noYield);

/** The folded text of item `i`, read back through `starts`. */
const itemText = (h: Haystack, i: number) => h.text.slice(h.starts[i], h.starts[i + 1]! - 1);

describe('buildHaystack', () => {
  it('joins folded names, each with a leading space and a trailing newline', async () => {
    const h = await build(['Pirkka banaani', 'Crème fraîche', 'Leipä']);
    expect(h.text).toBe('\n pirkka banaani\n creme fraiche\n leipa\n');
    expect(h.size).toBe(3);
  });

  it('records where each item starts, plus a sentinel at the end of the text', async () => {
    const h = await build(['ab', 'c', 'def']);
    expect([...h.starts]).toEqual([1, 5, 8, 13]);
    expect(h.starts).toHaveLength(h.size + 1);
    expect(h.starts[h.size]).toBe(h.text.length);
    expect([0, 1, 2].map((i) => itemText(h, i))).toEqual([' ab', ' c', ' def']);
  });

  it('builds an empty tier and a one-item tier', async () => {
    const empty = await build([]);
    expect(empty).toEqual({ text: '\n', starts: new Uint32Array([1]), size: 0 });

    const one = await build(['Maito']);
    expect(one.text).toBe('\n maito\n');
    expect([...one.starts]).toEqual([1, 8]);
  });

  it('reads every fixture name back in order', async () => {
    const h = await build(tiers[1].names);
    expect(itemText(h, 0)).toBe(' pirkka banaani');
    expect(itemText(h, 10)).toBe(' valio arki creme fraiche 12');
    expect(itemText(h, h.size - 1)).toBe(' pirkka luomu maito 1l');
  });

  it('yields between chunks and gives the same result as one chunk', async () => {
    const names = Array.from({ length: 2 * CHUNK_SIZE + 1 }, (_, i) => `tuote ${i}`);
    const yieldFn = vi.fn(noYield);
    const chunked = await buildHaystack(names, yieldFn);
    expect(yieldFn).toHaveBeenCalledTimes(2);
    expect(chunked.text).toBe('\n' + names.map((n) => ' ' + n).join('\n') + '\n');
    expect(itemText(chunked, CHUNK_SIZE)).toBe(` tuote ${CHUNK_SIZE}`);
  });

  it('does not yield for a tier of exactly one chunk', async () => {
    const yieldFn = vi.fn(noYield);
    await buildHaystack(
      Array.from({ length: CHUNK_SIZE }, () => 'x'),
      yieldFn,
    );
    expect(yieldFn).not.toHaveBeenCalled();
  });
});

describe('itemAt', () => {
  // text: "\n ab\n c\n def\n", starts [1, 5, 8, 13]
  const haystack = build(['ab', 'c', 'def']);

  it('finds the item at its first and last character, and at its newline', async () => {
    const h = await haystack;
    expect([1, 3, 4].map((p) => itemAt(h, p))).toEqual([0, 0, 0]);
    expect([5, 6, 7].map((p) => itemAt(h, p))).toEqual([1, 1, 1]);
    expect([8, 11, 12].map((p) => itemAt(h, p))).toEqual([2, 2, 2]);
  });

  it('returns -1 for the leading newline and for an empty tier', async () => {
    expect(itemAt(await haystack, 0)).toBe(-1);
    expect(itemAt(await build([]), 0)).toBe(-1);
  });
});

describe('word-start needles land on the right item', () => {
  // The draft's "\n" + word needle matched the previous item's separator, missed item 0
  // and missed items at a resume point (review blocker 1). " " + word cannot.
  const h = build(['Pirkka banaani', 'Pirkka maito', 'Valio maito', 'Pirkka leipä']);
  const find = async (needle: string, fromItem: number) => {
    const hay = await h;
    return itemAt(hay, hay.text.indexOf(needle, hay.starts[fromItem]));
  };

  it('matches a word at the very start of item 0', async () => {
    expect(await find(' pirkka', 0)).toBe(0);
  });

  it('matches the item right after a match when searching on from it', async () => {
    expect(await find(' pirkka', 1)).toBe(1);
  });

  it('matches at a resume point, skipping items without the word', async () => {
    expect(await find(' pirkka', 2)).toBe(3);
    expect(await find(' maito', 2)).toBe(2);
  });
});

describe('yieldToMain', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves through a message channel when scheduler.yield is missing', async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
  });

  it('uses scheduler.yield when the browser has it', async () => {
    const schedulerYield = vi.fn(async () => {});
    vi.stubGlobal('scheduler', { yield: schedulerYield });
    await yieldToMain();
    expect(schedulerYield).toHaveBeenCalledOnce();
  });
});
