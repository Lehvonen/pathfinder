// Fetches the core search files written by `pnpm data:search` (docs/plans/search.md §6).
// `?url` makes Vite emit each file as a content-hashed asset, so the service worker can
// precache it and a changed file is fetched again on its own (ARCHITECTURE.md §14).
import type { Category } from '@pathfinder/core';
import type { Aliases, CategoryRank, CategoryTop, TierData, TierNumber } from '@pathfinder/search';
import aliasesUrl from '../../../../data/build/core/aliases.json?url';
import categoriesUrl from '../../../../data/build/core/categories.json?url';
import categoryRankUrl from '../../../../data/build/core/category-rank.json?url';
import categoryTopUrl from '../../../../data/build/core/category-top.json?url';
import tier1Url from '../../../../data/build/core/search-tier-1.json?url';
import tier2Url from '../../../../data/build/core/search-tier-2.json?url';
import tier3Url from '../../../../data/build/core/search-tier-3.json?url';

/** What the engine needs before any tier: four small files, ~55 KB gzipped together. */
export type BaseData = {
  categories: Category[];
  categoryTop: CategoryTop;
  categoryRank: CategoryRank;
  aliases: Aliases;
};

export type FetchJson = (url: string) => Promise<unknown>;

export const TIER_URLS: Readonly<Record<TierNumber, string>> = {
  1: tier1Url,
  2: tier2Url,
  3: tier3Url,
};

export const fetchJson: FetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
};

// The files are validated by the build before they are written, so they are trusted here.

export async function loadBase(fetch: FetchJson = fetchJson): Promise<BaseData> {
  const [categories, categoryTop, categoryRank, aliases] = await Promise.all(
    [categoriesUrl, categoryTopUrl, categoryRankUrl, aliasesUrl].map(fetch),
  );
  return {
    categories: categories as Category[],
    categoryTop: categoryTop as CategoryTop,
    categoryRank: categoryRank as CategoryRank,
    aliases: aliases as Aliases,
  };
}

export async function loadTier(tier: TierNumber, fetch: FetchJson = fetchJson): Promise<TierData> {
  return (await fetch(TIER_URLS[tier])) as TierData;
}
