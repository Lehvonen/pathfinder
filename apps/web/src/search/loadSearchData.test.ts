import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, loadBase, loadTier, TIER_URLS } from './loadSearchData';

/** A fetch that answers with the file name it was asked for, and records the order. */
const fakeFetch = () => {
  const requested: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    requested.push(url);
    return { from: url };
  });
  return { fetch, requested };
};

describe('loadBase', () => {
  it('fetches the four base files at once and names each one', async () => {
    const { fetch, requested } = fakeFetch();
    const base = await loadBase(fetch);
    expect(requested).toHaveLength(4);
    expect(base.categories).toEqual({ from: expect.stringContaining('categories') });
    expect(base.categoryTop).toEqual({ from: expect.stringContaining('category-top') });
    expect(base.categoryRank).toEqual({ from: expect.stringContaining('category-rank') });
    expect(base.aliases).toEqual({ from: expect.stringContaining('aliases') });
  });
});

describe('loadTier', () => {
  it('fetches only the file of the tier asked for', async () => {
    const { fetch, requested } = fakeFetch();
    await loadTier(2, fetch);
    expect(requested).toEqual([TIER_URLS[2]]);
    expect(TIER_URLS[2]).toContain('search-tier-2');
  });

  it('has one distinct file per tier', () => {
    expect(new Set(Object.values(TIER_URLS)).size).toBe(3);
  });
});

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body of a successful response', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"ok":true}', { status: 200 }));
    await expect(fetchJson('/x.json')).resolves.toEqual({ ok: true });
  });

  it('fails with the URL and status instead of parsing an error page', async () => {
    vi.stubGlobal('fetch', async () => new Response('Not found', { status: 404 }));
    await expect(fetchJson('/x.json')).rejects.toThrow('/x.json: HTTP 404');
  });
});
