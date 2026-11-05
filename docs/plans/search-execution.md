# Execution plan: search engine

**A finished record, not kept current.** This was the working document behind
`docs/plans/search.md` while search was built (PRs #14–#19): that file says **what** and
**why** and stays current; this one says exactly **how**, commit by commit, as planned at
the time. Kept for the report (ARCHITECTURE.md §13, Track H). Where the two disagree,
`search.md` and the code win.

**Revision 2, 2026-10-04**: rewritten after a pr-reviewer pass ("request changes": 4
blockers, 10 majors). Every finding is either fixed below or listed in §11 with the
reason it was not.

**The goal that decides every trade-off: the shopper sees useful results while still
typing.** Concretely, on the oldest team phone:

| Target                                          | Budget              | Source                                                               |
| ----------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| Keystroke → results painted                     | < 50 ms             | §14                                                                  |
| …of which the engine (query → result list)      | < 5 ms p95          | this plan, leaves ~45 ms for React and paint                         |
| Longest main-thread task while tiers 2–3 load   | < 50 ms             | this plan: loading must never freeze typing                          |
| App open → first search possible (tier 1 ready) | < 500 ms            | §14                                                                  |
| "maito": a milk is the first product within     | 2 keystrokes (`ma`) | §14, 1–3 keystrokes                                                  |
| Core search payload, all files, gzipped         | < 1 MB              | leaves 2 MB of the 3 MB core budget for graph, floorplan, placements |

---

## 1. Measurements that fixed the design

All on `data/normalised/` (scrape of 2026-10-03), Node 22 on a PC. C18 turns the
scratch scripts into a committed bench.

### 1.1 Ranking: popularity only, not "word start first"

`docs/plans/search.md` §5.4 (committed in 9cca3e9) ranks a word-start match above an
infix match. On real data that is **wrong** for Finnish:

| Query      | Popularity only (top result)               | Word start first (top result)     |
| ---------- | ------------------------------------------ | --------------------------------- |
| `leipä`    | Vaasan Ruispalat … täysjyväruis**leipä** ✔ | Pirkka **leipä**juusto ✘          |
| `pesuaine` | Fairy Platinum astian**pesuaine** ✔        | Heti kirjopyykin pesuaine (rarer) |
| `juusto`   | Pirkka kerma**juusto** 1 kg ✔              | Arki™**juusto**viipale            |
| `maito`    | Pirkka suomalainen kevyt**maito** 1l ✔     | rasvaton maito 1l ✔               |

The noun that matters is usually the **last** part of a compound (`ruisleipä` is bread,
`leipäjuusto` is cheese). **Decision: rank by popularity alone.** The reviewer's tier
simulation confirmed the top 3 for `ma`, `maito`, `leipä`, `kahvi`, `banaani`,
`jauheliha`, `pesuaine`, `juusto` and `wc paperi` are identical to a flat popularity
sort.

Consequence that makes everything fast: each tier is stored **pre-sorted** in final rank
order, so scan order is rank order and the scan **stops at the `limit`-th match**.

### 1.2 Short words: word start only

For 1–2 characters, infix matching is noise: `m` matches 29,147 names and its top result
is `Kurkku Suomi`. Word start gives `miniluumutomaatti`, then `rasvaton maito`; `ma`
gives `rasvaton maito 1l` first. **Decision: each query word of 1–2 characters matches
word starts only; a word of 3+ characters matches anywhere.** Per word, not per query, so
`maito l` narrows to names with a word starting with `l` instead of matching the `l` in
every `1l` (review finding).

### 1.3 No index: a scan is fast enough, and an index would not fit

| Measurement                                                  | Result                  |
| ------------------------------------------------------------ | ----------------------- |
| Full scan, every name, `includes`, per query                 | ~2 ms                   |
| Same over one joined string with `indexOf`                   | ~1.5 ms                 |
| Fold all 39,479 names: shipped `fold()` (C2) / one loop only | 23 ms / 31 ms           |
| Distinct infix substrings an infix index would hold          | ~490,000                |
| All tiers, columnar JSON `{eans, names, categoryIds}`, gzip  | **849 KB** (2.4 MB raw) |
| …names / EANs / category ids alone, gzip                     | 613 / 185 / 49 KB       |
| Same data as an array of `{ean, name}` objects, gzip         | 928 KB                  |

**Decision: no FlexSearch, no trigram index, unless the phone bench (C27) misses the
budgets.** This holds **only with the leapfrog scan in §4.4**. The first draft verified
extra words with an unbounded `indexOf`, which the reviewer measured at 32–176 ms on a
PC for `maito xyzq`, `maito laktoositonx`, `pirkka zzz`. The leapfrog bounds every
query to at most one pass per alternative.

### 1.4 Categories

- 1,042 categories, depth 0 / 1 / 2 = 28 / 191 / 823. **There is no leaf called
  "Maito"**: `maito` matches "Maito, juusto, munat ja rasvat" (top level), "Maitotuotteet"
  and "Vuohen- ja lampaanmaitojuustot".
- Category names are **plural** and Finnish gradates consonants: `leipä` does not match
  "Leivät", `olut` matches nothing ("Oluet"). **Aliases apply to categories too.**
- `m` matches 410 category names, `ma` 162. **No category results unless a word has 3+
  characters.** (The draft's "exact whole-word" exception is dropped: unimplemented and
  untested, review finding.)
- Ordering by subtree size, as drafted, always puts top-level categories first, so `maito`
  and `juusto` would both add "all of dairy" as a generic entry. **Fixed in §4.6: deeper
  categories first, and an ancestor is dropped when a descendant also matches.**

### 1.5 Names are not all Finnish

About 220 names carry accents beyond ä/ö/å/é/ü (è 54, ø 44, á 31, ñ 19, ô 15, à 14, ú 13,
ó 12, …), 3 contain a decomposed ä (U+0308), and 11 contain zero-width spaces. With the
draft's table, `Valio Arki crème fraîche 12%` folded to `cr me fra che`. Verified fix:
NFD + strip combining marks gives `creme fraiche`, `jamon serrano`. §4.1 does this only
for names that need it, at ~23 ms for all names on a PC.

### 1.6 Aliases are not optional

`vessapaperi` returns **0** products (the store says `wc-paperi` / `talouspaperi`). The
first alias file is seeded from measured gaps, not invented.

---

## 2. Package layout

```
packages/search/
├── package.json            @pathfinder/search; exports "." and "./build"; no runtime deps
├── tsconfig.json           extends ../../tsconfig.base.json
├── vitest.config.ts        thresholds 85; excludes types.ts, index.ts, fixtures.ts, *.golden.test.ts
├── vitest.golden.config.ts includes only *.golden.test.ts (non-gating, §8.2)
└── src/
    ├── index.ts            runtime exports
    ├── types.ts            derived from core types where they overlap (§3.0)
    ├── fixtures.ts         ~40 hand-written products, 3 tiers, ~12 categories, for tests
    ├── normalise.ts        fold(), foldWithOffsets()
    ├── haystack.ts         names → Haystack (joined string + starts), chunked build
    ├── query.ts            raw → ParsedQuery (slots, per-word mode, aliases)
    ├── scan.ts             leapfrog scan with early stop
    ├── categories.ts       category matching, subtree masks, ordering
    ├── engine.ts           createSearchEngine(): tiers, search(), searchMore(), searchWithin()
    ├── typo.ts             edit-distance-1 fallback over an idle-built vocabulary
    └── build/
        ├── index.ts        build-time exports ("./build")
        ├── tiers.ts        equal-share split into tiers 1–3
        ├── category-top.ts categoryId → top 10 EANs; categoryId → best global rank
        ├── tier-file.ts    products → TierData (columnar, pre-sorted)
        └── validate.ts     the build invariants (§6), tested
packages/core/src/
└── compare.ts              compareStrings() + the product rank comparator, moved/added (§3.0)
scripts/
├── tsconfig.json           so `pnpm typecheck` covers scripts/ (§7 C13)
├── build-search.ts         thin CLI: read, call build/, validate, write
└── bench-search.ts         typing sequences over the real tiers, p50/p95/max
data/curation/aliases.json  hand-maintained
data/build/core/            generated, committed (names as in architecture §5 where they exist):
    search-tier-1.json, search-tier-2.json, search-tier-3.json,
    categories.json, category-top.json, category-rank.json, aliases.json
```

`build/` is in the package so it is unit-tested and shares `fold()` and the comparator
with the runtime. The web app imports only `"."`; `"./build"` is a separate export path
(`"exports": { ".": "./src/index.ts", "./build": "./src/build/index.ts" }`).

`scripts/build-search.ts` is the search half of the planned `scripts/build-data.ts`: when
`data:build` is written, it calls the same `build/` functions and this CLI becomes a thin
alias. Recorded in C0 so `search.md` §2/§7 agree.

---

## 3. Data formats

All generated files are written with sorted keys and no whitespace, so a re-run on the
same input is byte-identical.

### 3.0 Reuse (Rule A)

- `types.ts` derives from `packages/core/src/types.ts`: `type ProductRef = Pick<Product, 'ean' | 'name' | 'categoryId'>`;
  categories are `Category` itself. No restated shapes.
- `compareStrings` moves from `scraper/normalise/compare.ts` to `packages/core/src/compare.ts`
  (the scraper re-imports it), and the rank comparator (§4.4) is added next to it. Core
  stays framework-free; both are pure.
- Input validation in `build-search.ts` reuses the Zod schemas in
  `scraper/normalise/schema.ts` through a new `scraper/package.json` export
  `"./schema": "./normalise/schema.ts"`. No second schema.
- `categories.json` is the one core categories file from architecture §5 (same shape as
  `data/normalised/categories.json`); search ignores `temperature`. No search-only copy.

### 3.1 Tier files — `search-tier-N.json`

```ts
type TierData = {
  version: 1;
  tier: 1 | 2 | 3;
  eans: string[]; // index i is one product
  names: string[]; // display name, unchanged
  categoryIds: number[]; // for the category page
};
```

Arrays are in **final rank order**. Popularity itself is not shipped (architecture §6).
`categoryIds` extends §17's `{ean, name}` payload by 49 KB gzipped so the category page
works from core alone, without `placements-primary.json`, which needs the graph. A §17
row in C1b records it.

Estimated gzipped sizes: tier 1 ≈ 175 KB, tier 2 ≈ 215 KB, tier 3 ≈ 460 KB.

### 3.2 `category-top.json` and `category-rank.json`

- `category-top.json`: `Record<categoryId, string[]>`, top 10 EANs of each category's
  **subtree**, in rank order (architecture §7 step 5 shape, unchanged). Empty categories
  omitted.
- `category-rank.json`: `Record<categoryId, number>`, the global rank position of the
  subtree's best product (0 = most popular product in the store). A tie-break for
  category ordering (§4.6) that does not depend on which tiers are loaded. ~3 KB.

### 3.3 `aliases.json` (source `data/curation/aliases.json`, copied to build)

```json
{
  "vessapaperi": ["wc-paperi", "talouspaperi"],
  "leipä": ["leivät", "leipä"],
  "olut": ["oluet", "olut"]
}
```

- Key: one query word, written naturally; folded at load.
- Value: the terms that word means. **The key is not implied**: list it if the word
  itself should still match.
- Validation (`build/validate.ts`, Zod): non-empty strings; key ≤ 40 chars; ≤ 8 values;
  **a key's folded form contains no space** (lookups are per word, so `wc-paperi` as a key
  could never match); no two keys fold to the same string.

Seed list (C14), ~20 entries from measured gaps: `vessapaperi`, `leipä`, `olut`, `kevari`,
`jogu`, `maitoa`, `maidon`, `kahvia`, `banaanit`, `perunat`, `kananmunat`, `munat`, `limu`,
`sipsit`, `wc`, `tiskiaine`, `pyykkiaine`, `karkki`, `jäätelö`, `mehu`. Each checked
against real results before it goes in.

---

## 4. Algorithms

### 4.1 `fold(text)` and `foldWithOffsets(text)` — `normalise.ts`

Order matters:

1. Remove zero-width characters (`​-‍`, `﻿`) so they do not split words.
2. **Only if** the text contains a character outside `[\x00-\x7FäöåÄÖÅ]` (one precompiled
   regex test): `normalize('NFD')`, then remove `\p{M}`. Otherwise skip, so ~99% of names
   pay nothing. This also handles the decomposed ä.
3. `toLowerCase()`; map `ä→a`, `ö→o`, `å→a`, and the letters NFD does not decompose:
   `ø→o`, `æ→ae`, `œ→oe`, `ß→ss`.
4. Every character not in `[a-z0-9]` becomes a space (`-`, `/`, `,`, `(`, `™`, `&`, `.`).
5. Collapse runs of spaces, trim.

Result alphabet: `[a-z0-9 ]` only. `haystack.ts` relies on it (`\n` never occurs in a
folded name; a word start is always preceded by a space).

`foldWithOffsets(text)` returns `{ folded, origin: Uint16Array }` where `origin[k]` is the
index in the **original** string of folded character `k`. It is the same function with
bookkeeping; `fold()` is implemented on top of it only if the bench shows no cost,
otherwise they share a test that asserts `foldWithOffsets(x).folded === fold(x)` for every
fixture name. Used only for highlighting 20 visible rows (§5.3).

Decisions:

- **No accent-aware boost.** `leipa` and `leipä` are the same query; a boost would break
  "scan order is rank order". (C0 removes the opposite claim from `search.md` §5.1/§8.)
- **No unit normalisation.** `1l` and `1 l` stay different.
- Idempotent: `fold(fold(x)) === fold(x)`. Tested.

### 4.2 `Haystack` — `haystack.ts`

```ts
type Haystack = {
  text: string; // "\n" + " " + f0 + "\n" + " " + f1 + "\n" + … + " " + f(n-1) + "\n"
  starts: Uint32Array; // length size + 1; starts[i] = index of item i's leading space;
  // starts[size] = text.length (sentinel)
  size: number;
};
```

- Item `i` occupies `[starts[i], starts[i+1] - 1)`; `text[starts[i+1] - 1]` is its `\n`.
- **Every item begins with a space**, so a word-start needle is always `' ' + alt`, and a
  match of it at `starts[i]` belongs to item `i` (fixes review blocker 1: the draft's
  `'\n' + alt` needle matched on the previous item's separator).
- `itemAt(h, pos)`: binary search for the largest `i` with `starts[i] <= pos`.
- Needles never contain `\n`, so no match crosses items.
- **Chunked build:** `buildHaystack(names, yieldFn)` folds and appends 2,000 names per
  chunk and `await yieldFn()` between chunks; the haystack is published only when
  complete. `yieldFn` is injected (default: `scheduler.yield` when present, else a
  `MessageChannel` post), so tests pass a no-op and stay synchronous in effect.

### 4.3 `parseQuery(raw, aliases)` — `query.ts`

```ts
type Alternative = { needle: string }; // already prefixed with ' ' in word-start mode
type Slot = { word: string; mode: 'word-start' | 'anywhere'; alternatives: Alternative[] };
type ParsedQuery = { slots: Slot[]; categoryEligible: boolean; isEmpty: boolean };
```

1. `fold(raw)`, split on spaces, drop empties, **deduplicate**, keep the first 6 words.
2. **Mode per word**: 1–2 characters → `word-start`, else `anywhere`.
3. Aliases per word:
   - **Completed words** (all but the last, or the last when `raw` ends with a space):
     exact key lookup.
   - **The word being typed**, 4+ characters: also the aliases of every key that **starts
     with** it (`vessap` → `wc paperi`). 1–3 characters: exact only.
   - Alternatives = the word (unless an exact alias replaced it) + alias terms, folded,
     deduplicated. An alias term inherits its slot's mode only if it has 1–2 characters;
     longer alias terms are `anywhere`.
4. **Subsumption**, after modes are known: drop alternative A if another alternative B in
   the same slot matches a superset of what A matches:
   - both `anywhere`: B is a substring of A
   - both `word-start`: B is a prefix of A, or `' ' + B` occurs in `' ' + A`
   - mixed: B `anywhere` and B is a substring of A
     (fixes review minor: the draft applied the infix rule in word-start mode too).
5. `categoryEligible` = some word has 3+ characters.
6. Slot order does not matter for correctness or speed with the leapfrog (§4.4).

### 4.4 `scan(h, q, from, limit, filter?)` — `scan.ts` (leapfrog)

```ts
function scan(
  h: Haystack,
  q: ParsedQuery,
  from: number,
  limit: number,
  filter?: (item: number) => boolean,
): { items: number[]; next: number | null }; // next = resume index; null = tier exhausted
```

Build-time order (`compareProductRank` in `packages/core/src/compare.ts`):

1. ranked before unranked; 2. popularity descending; 3. name length ascending;
2. EAN with `compareStrings` (total, locale-independent).

**Leapfrog**, so the cost is at most one forward pass per alternative, whatever the query
(fixes review blocker 2):

1. For every alternative `a` of every slot, a cursor `pos[a] = text.indexOf(a.needle,
starts[from])` (`-1` = exhausted). `slotItem(s)` = smallest `itemAt(pos[a])` over the
   slot's live alternatives; a slot with none left ends the scan (`next = null`).
2. `candidate` = largest `slotItem(s)` over all slots.
3. Every alternative whose item is below `candidate` re-seeks with
   `indexOf(needle, starts[candidate])`. Repeat 1–3 until every slot's item equals
   `candidate` (all words present in one item) or a slot runs out.
4. If `filter` is given and rejects `candidate`, skip it; else push it.
5. Advance every cursor positioned inside `candidate` to `indexOf(needle,
starts[candidate + 1])`, so no item is visited twice.
6. Stop when `items.length === limit`, returning `next = candidate + 1`, or when a slot is
   exhausted (`next = null`). If the last pushed item is the tier's last item,
   `next = null` (the tier is done even though `limit` was reached).

`indexOf` only moves forward, so each needle scans the text at most once per call. One-word
queries do exactly what the first draft did. `maito xyzq`, `maito laktoositonx` and
`pirkka zzz` become one pass over `xyzq`, `laktoositonx` and `zzz` respectively: the rare
word exhausts quickly and ends the scan.

`filter` is how `searchWithin` restricts to a category subtree. A selective filter can
force a long scan, which is acceptable: at most one pass, ~1.5 ms on a PC.

### 4.5 Engine — `engine.ts`

```ts
type ProductHit = ProductRef & { kind: 'product'; tier: 1 | 2 | 3 };
type CategoryHit = { kind: 'category'; category: Category; topProducts: ProductRef[] };
type Cursor = { tier: 1 | 2 | 3; next: number };
type SearchResponse = {
  query: string;
  categories: CategoryHit[]; // 0–3
  products: ProductHit[]; // tier 1 first, then 2, then 3
  pendingTiers: (1 | 2 | 3)[]; // not loaded yet: more results may follow
  cursor: Cursor | null; // where "show more" continues; null = nothing more, ever
  corrected?: { from: string; to: string };
};

function createSearchEngine(input: {
  categories: Category[];
  categoryTop: CategoryTop;
  categoryRank: CategoryRank;
  aliases: Aliases;
  yieldFn?: () => Promise<void>;
}): SearchEngine;

interface SearchEngine {
  addTier(data: TierData): Promise<void>; // chunked; resolves when searchable
  search(raw: string, limit?: number): SearchResponse; // default 20
  searchMore(raw: string, cursor: Cursor, limit?: number): SearchResponse;
  searchWithin(categoryId: number, raw: string, limit?: number, cursor?: Cursor): SearchResponse;
  getVersion(): number; // increments when a tier or the vocabulary lands
  subscribe(listener: () => void): () => void; // for useSyncExternalStore
}
```

- **Progression:** scan tier 1 until `limit`, then tier 2, then tier 3. A tier that is not
  loaded **stops** progression there, is listed in `pendingTiers`, and the cursor becomes
  `{ tier: firstMissingTier, next: 0 }` (review finding: "show more" must not vanish or
  return nothing silently). `searchMore` on a cursor whose tier is still missing returns
  no products and the same cursor.
- **Appends only:** earlier tiers return the same items in the same order, so a re-run
  after a tier arrives is the previous list with items appended. Tested.
- **No memo.** A scan costs ~1 ms; the draft's memo on the raw query returned stale
  responses after `addTier` (review blocker 3). Re-runs are driven by `getVersion()`.
- **EAN map:** `addTier` also fills `Map<ean, {tier, index}>` (inside the same chunked
  build). `topProducts` resolves `categoryTop` EANs through it and includes **only loaded**
  products, so the "e.g." line under a category fills in as tiers arrive (review finding).
- **No result count** (needs a full scan).
- Categories are not returned by `searchMore` or `searchWithin`.

### 4.6 Categories — `categories.ts`

At engine creation: fold every name; build `children` and `parent`; `depth`;
`subtreeMask(id)`: a `Uint8Array` over category ids, memoised.

Per query, when `categoryEligible`:

1. Match every slot against the folded category name, with the slot's mode and alias
   alternatives (`leipä` → "Leivät").
2. Score: folded name equals the folded query = 3; every slot matched at a word start = 2;
   else 1.
3. **Drop any matched category that has a matched descendant** (`maito`: "Maito, juusto,
   munat ja rasvat" goes, "Maitotuotteet" stays). Fixes review blocker 4.
4. Order: score desc, **depth desc**, `categoryRank` asc (most popular best product first),
   id asc.
5. Keep the top **3**.

Result for `maito`: "Maitotuotteet", then "Vuohen- ja lampaanmaitojuustot".
`hedelmät ja vihannekset`: the top-level category alone (no descendant contains the
phrase), score 3. Both are golden queries.

1,042 short names: < 0.3 ms per query.

`searchWithin(categoryId, raw)`:

- Empty query: the subtree's products in rank order, tier by tier, via `scan` with an
  always-matching query and the subtree filter.
- Otherwise: normal scan with `filter = i => mask[categoryIds[i]]`.
- Subcategory chips come from `children`; no engine call.

### 4.7 What is not searched

Department names (internal), brand as a separate field, and category names as a product
ranking signal (agreed). The architecture's §10 "alias matches are boosted" is **dropped**:
aliases widen matching but do not boost, or scan order would stop being rank order.
Recorded in C1b.

### 4.8 Typo fallback — `typo.ts`

Runs only when **all** of: every tier loaded, **vocabulary ready**, fewer than 5 products,
no categories, and a word of 5+ characters with no substring match anywhere.

1. **Vocabulary** (distinct folded words of 3+ characters with frequency, bucketed by
   length) is built **in idle chunks after tier 3 lands** (same `yieldFn`), never during a
   keystroke (review finding). Until ready, the fallback is skipped. `getVersion()`
   increments when it lands.
2. Candidates: vocabulary words of length ±1 at Damerau–Levenshtein distance 1, bounded
   check with early exit.
3. Most frequent candidate per word, ties alphabetical; re-run; set `corrected`. One pass.

### 4.9 Rejected

| Idea                          | Why not                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| FlexSearch / trigram index    | §1.3: the leapfrog scan is under budget; an infix index ~490k terms             |
| Debounce                      | Adds latency by definition                                                      |
| Web Worker by default         | Chunked loading (§4.2) removes the jank it would fix; revisit only if C27 fails |
| Stemming / inflection rules   | 41 inflected names; aliases cover the queries                                   |
| Word-start boost, alias boost | Break "scan order = rank order"; §1.1 shows word start is wrong anyway          |
| Incremental narrowing         | Early stop already makes the common case cheap                                  |
| Result count                  | Needs a full scan per keystroke                                                 |
| Memo of the previous query    | Caused stale results (review blocker 3); a scan is ~1 ms                        |

---

## 5. Runtime in the web app

### 5.1 Loading order

1. App shell renders the search bar immediately, enabled.
2. In parallel, highest priority: `categories.json`, `category-top.json`,
   `category-rank.json`, `aliases.json`, `search-tier-1.json`. Create the engine,
   `await addTier(tier1)`. **Search is live.** Target < 500 ms on the oldest phone.
3. Then fetch tier 2 and tier 3; `addTier` each (chunked, yields every 2k names, so no
   task exceeds the 50 ms long-task target). Then the typo vocabulary, also chunked.
4. Files are imported with Vite `?url`: content-hashed, precacheable by Track G.

Typing before tier 1 is ready: keystrokes stay in the input; the query runs when tier 1
lands. After ~200 ms, a quiet "loading products…" line (`aria-live="polite"`).

### 5.2 Per keystroke

- `onChange` → `setQuery(raw)` (urgent; the input never lags).
- `const deferred = useDeferredValue(query)`.
- `const version = useSyncExternalStore(engine.subscribe, engine.getVersion)`.
- Results: `useMemo(() => runSearch(engine, deferred, shown, version), [engine, deferred, shown, version])`.
  `runSearch` takes `version` as an argument (and ignores it), so every dependency is
  actually used and `exhaustive-deps` stays quiet; a new tier re-runs the search (fixes the
  stale-memo finding).
- `shown` starts at 20 and resets to 20 when `deferred` changes. "Show more" sets
  `shown += 20`. When a tier lands, the re-run uses the same `shown`, so the list only
  grows (fixes the show-more vs tier-arrival finding). `searchMore` is used only by the
  category page's infinite list.
- At most `shown` product rows + 3 category rows; rows memoised on `ean`.

### 5.3 Components and helpers (one component per file, Rule B)

| File (`apps/web/src/search/`) | Role                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadSearchData.ts`           | Fetch + parse in the §5.1 order                                                                                                                                         |
| `useSearchEngine.ts`          | Creates the engine once, adds tiers as they arrive                                                                                                                      |
| `useSearch.ts`                | Query, deferred value, version, `shown`, show more                                                                                                                      |
| `highlight.ts` + test         | Visible-row highlight: `foldWithOffsets(name)`, find each parsed alternative, map back through `origin`. Works for alias matches (`vessapaperi` highlights `WC-paperi`) |
| `SearchBar.tsx`               | `type="search"`, `enterKeyHint="search"`, clear button, label                                                                                                           |
| `ProductResult.tsx`           | Name with highlight; button `aria-label={\`Add ${name}\`}`                                                                                                              |
| `CategoryResult.tsx`          | Name, "e.g." line from `topProducts`; **Add "<query>" as any** (generic entry) and **Browse** buttons, each with a specific `aria-label`                                |
| `SearchResults.tsx`           | Category rows, product rows, "show more", pending-tier note                                                                                                             |
| `CategoryPage.tsx`            | Subcategory chips, its own `SearchBar`, `searchWithin` list                                                                                                             |

"Add" puts the `ListItem` from `core/types.ts` on the shopping list (Track F,
`apps/web/src/list/`, ARCHITECTURE.md §11); adding one already there raises its amount.

---

## 6. Build pipeline

`pnpm data:search` → `tsx scripts/build-search.ts`:

1. Read `data/normalised/{products,popularity,categories}.json` and
   `data/curation/aliases.json`; validate with the scraper's schemas (§3.0) and the alias
   rules (§3.3). Stop with the file and first problems on failure.
2. Sort with `compareProductRank`.
3. `build/tiers.ts` (search.md §3):
   - tier 1: equal share of 8,000 over the 14 food top-level categories, ranked only
   - tier 2: every remaining ranked food product, then an equal share of what is left of
     10,000 over the 11 non-food, non-clothing categories
   - tier 3: everything else
   - the food, clothing and uncategorised lists are **category id constants** in
     `tiers.ts` (ids are stable: `category-ids.json` is append-only). The build checks each
     id still has the expected name and fails hard if not, catching a K-Ruoka rename.
   - each tier re-sorted with `compareProductRank`
4. Write `search-tier-1..3.json`, `category-top.json`, `category-rank.json`,
   `categories.json`, `aliases.json` to `data/build/core/`.
5. Print products per tier, per-category shares, gzipped size per file; **fail above 1 MB
   gzipped total**.
6. Write only after `build/validate.ts` passes:
   - every EAN in exactly one tier; tier sizes sum to the product count
   - tiers 1–2: no unranked, no clothing, **no uncategorised**
   - each tier sorted by `compareProductRank`
   - every `categoryIds[i]` exists in `categories.json`
   - every EAN in `category-top.json` exists in some tier

---

## 7. Commits

One file per commit, except a source file with its test, `package.json` with
`pnpm-lock.yaml`, and a new dependency before its first use. Each commit typechecks and
passes tests on its own. Lines are non-test, estimated.

### PR 1 — `search/engine`: docs aligned, the engine, no data (~500 lines)

| #   | Files                                                                                            | What                                                                                                                                                                                                                                                                                                                                                                                                   | Lines |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| C0  | `docs/plans/search.md`                                                                           | Align the committed plan with this one (§10 list of 9 items)                                                                                                                                                                                                                                                                                                                                           | docs  |
| C1b | `docs/ARCHITECTURE.md`                                                                           | §5 adds `packages/search` and the core search files; §17 rows: three tiers (answers hot-index size), scan instead of index pending the phone bench, payload with `categoryIds`, no alias boost, no worker by default (review: docs in the same PR as the code)                                                                                                                                         | docs  |
| C1  | `packages/search/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`, `pnpm-lock.yaml`   | Skeleton; `exports` with `"."` and `"./build"` (+ empty `src/build/index.ts`); vitest `passWithNoTests: true`; coverage excludes `types.ts`, `index.ts`, `fixtures.ts`, `build/index.ts`                                                                                                                                                                                                               | 35    |
| C1c | `.github/workflows/ci.yml`                                                                       | Codecov `files:` adds `packages/search/coverage/lcov.info`                                                                                                                                                                                                                                                                                                                                             | 1     |
| C1d | `packages/core/src/compare.ts` + test, then `scraper/normalise/compare.ts` re-export (2 commits) | Move `compareStrings`; add `compareProductRank`. Tests: each of the four keys decides when the earlier ones tie                                                                                                                                                                                                                                                                                        | 30    |
| C2  | `src/normalise.ts` + test                                                                        | §4.1. Tests: `Täysjyväruisleipä`, `Arki™juustoviipale`, `n.36 kpl/pak`, `Rustico-leipä`, `Crème fraîche`, `Jamón`, decomposed ä, zero-width space, `Smørrebrød` (ø), idempotence, alphabet, `foldWithOffsets` agrees with `fold` and maps back correctly across collapsed spaces                                                                                                                       | 55    |
| C3  | `src/types.ts`                                                                                   | §3.0, §4.5 types, derived from core                                                                                                                                                                                                                                                                                                                                                                    | 45    |
| C4  | `src/fixtures.ts` + `src/haystack.ts` + test                                                     | §4.2. Tests: `itemAt` at first/last char of first/middle/last item; word-start match on **item 0**, on the item **right after** a match, and at a **resume point**; `starts.length === size + 1`; empty tier; one item; chunked build gives the same result as one chunk                                                                                                                               | 70    |
| C5  | `src/query.ts` + test                                                                            | §4.3. Tests: **2 vs 3** chars per word (and mixed `maito l`); trailing space completes a word; alias prefix at **3 vs 4** chars; dedup; **6 words kept, 7 → 6**; subsumption per mode incl. `xpaperi`/`paperi` in word-start (kept) vs anywhere (dropped); alias replacing vs extending                                                                                                                | 85    |
| C6  | `src/scan.ts` + test                                                                             | §4.4. Tests: early stop at limit; resume from `next`; **exactly `limit` matches ending on the tier's last item → `next: null`**; AND, OR, phrase; word-start vs anywhere; an item matching twice counted once; `maito xyzq` returns `[]` and `next: null` with every cursor having moved forward only (asserted on cursor positions, not timing); filter                                               | 95    |
| C7  | `src/categories.ts` + test                                                                       | §4.6. Tests: **2 chars → none, 3 → some**; ancestor dropped when descendant matches; depth beats `categoryRank`; score order; **3 vs 4** matches capped to 3; `leipä` → "Leivät" via alias; subtree mask                                                                                                                                                                                               | 75    |
| C8  | `src/engine.ts` + test                                                                           | §4.5. Tests: tier order; missing tier 2 stops progression and the cursor points at tier 2; **search, `addTier`, same raw search → appended results** (blocker 3); `searchMore` on a pending tier returns the same cursor; `topProducts` for a category whose top EAN is in tier 3 appears only after tier 3 is added; `getVersion` / `subscribe` fire on `addTier`; `searchWithin` empty and non-empty | 105   |

PR 1 ≈ 500 lines of code plus two docs commits.

### PR 2 — `search/build`: real data in (~380 lines)

| #    | Files                                                                               | What                                                                                                                                                                                                                                                                      | Lines |
| ---- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| C9   | `src/build/tiers.ts` + test                                                         | Split. Tests: share arithmetic; spare places moving on twice; leftover food before non-food in tier 2; clothing and uncategorised never in 1–2; unranked always tier 3; an empty category; stable order; renamed-id check fails                                           | 100   |
| C10  | `src/build/category-top.ts` + test                                                  | Top 10 per subtree and best rank. Tests: subtree aggregation, fewer than 10, empty category omitted, rank of best product                                                                                                                                                 | 40    |
| C11  | `src/build/tier-file.ts` + test                                                     | Columnar `TierData`; byte-identical re-run                                                                                                                                                                                                                                | 30    |
| C12  | `src/build/validate.ts` + test                                                      | §6 step 6 invariants and §3.3 alias rules; one test per invariant, each with a passing and failing input                                                                                                                                                                  | 70    |
| C13  | root `package.json`, `pnpm-lock.yaml`                                               | dev deps `tsx`, `@pathfinder/search: workspace:*`, `@pathfinder/scraper: workspace:*`; script `typecheck` becomes `pnpm -r typecheck && tsc -p scripts`                                                                                                                   | 4     |
| C13b | `scraper/package.json`                                                              | `exports: { "./schema": "./normalise/schema.ts" }`                                                                                                                                                                                                                        | 3     |
| C13c | `scripts/tsconfig.json`                                                             | Extends base, includes `scripts/*.ts`                                                                                                                                                                                                                                     | 5     |
| C14  | `data/curation/aliases.json`                                                        | Seed list §3.3                                                                                                                                                                                                                                                            | 25    |
| C15  | `scripts/build-search.ts`, root script `data:search`                                | §6 as a thin CLI over `build/`                                                                                                                                                                                                                                            | 70    |
| C16  | `data/build/core/*` (search files)                                                  | Generated by `pnpm data:search`                                                                                                                                                                                                                                           | gen.  |
| C1e  | `docs/ARCHITECTURE.md`                                                              | §7 step 5 (tiers, not FlexSearch exports), §14 core table and search share of budget, §15 replaces "every EAN in the hot index is also in the full index" with the tier invariants, and the offline E2E "product only in the full index" becomes "product only in tier 3" | docs  |
| C17  | `src/search.golden.test.ts`, `vitest.golden.config.ts`, root script `search:golden` | §8.2. Reads `data/build/core`. **Non-gating**: not in `pnpm test`; run after `data:search` and before committing new data (review: golden tests on live data must not break CI on a re-scrape)                                                                            | test  |
| C18  | `scripts/bench-search.ts`                                                           | §8.3; PC numbers recorded in `search.md`                                                                                                                                                                                                                                  | 60    |

### PR 3 — `search/web` (~500 lines)

| #   | Files                                                                                          | What                                                                                                                                                                                                                                                                           | Lines |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| C19 | `apps/web/package.json`, `pnpm-lock.yaml`                                                      | `@pathfinder/search: workspace:*`; dev dep `vitest`; script `test: vitest run`                                                                                                                                                                                                 | 3     |
| C20 | `loadSearchData.ts`                                                                            | §5.1                                                                                                                                                                                                                                                                           | 50    |
| C21 | `useSearchEngine.ts`                                                                           |                                                                                                                                                                                                                                                                                | 35    |
| C22 | `useSearch.ts`                                                                                 | §5.2                                                                                                                                                                                                                                                                           | 50    |
| C23 | `highlight.ts` + test                                                                          | Tests: accent name, collapsed punctuation, alias match, no match                                                                                                                                                                                                               | 35    |
| C24 | `SearchBar.tsx`                                                                                |                                                                                                                                                                                                                                                                                | 40    |
| C25 | `ProductResult.tsx`, `CategoryResult.tsx`, `SearchResults.tsx`, `CategoryPage.tsx` (4 commits) | §5.3                                                                                                                                                                                                                                                                           | 230   |
| C26 | `App.tsx`                                                                                      | Wire the search screen in                                                                                                                                                                                                                                                      | 20    |
| C27 | `src/bench/SearchBench.tsx` + lazy import in `main.tsx` behind `import.meta.env.DEV`           | Phone bench: types the §8.3 sequences into the real input; measures **keystroke → painted** with `performance.mark` on input and in a post-commit effect + `requestAnimationFrame`, engine p95, and the **longest task** (PerformanceObserver `longtask`) while tiers 2–3 load | 60    |

### PR 4 — `search/polish` (~200 lines)

| #   | Files                        | What                                                                                                                                                                                                  |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C28 | `src/typo.ts` + test         | §4.8. Tests: swap, insertion, deletion, substitution; **4 vs 5** chars; **4 vs 5** results; categories present → no fallback; a tier missing → none; vocabulary not ready → none; frequency tie-break |
| C29 | `src/engine.ts` + test       | Wire typo fallback, idle vocabulary build, `corrected`                                                                                                                                                |
| C30 | `src/search.golden.test.ts`  | Add `mitao → maito` (only now, or C17 would fail)                                                                                                                                                     |
| C31 | `SearchResults.tsx`          | "Showing results for …"                                                                                                                                                                               |
| C32 | `data/curation/aliases.json` | Grown from the first Friday store run's failure log                                                                                                                                                   |
| C33 | `docs/ARCHITECTURE.md`       | §17 "scan instead of index" confirmed or reversed with the C27 phone numbers                                                                                                                          |

---

## 8. Verification

### 8.1 Unit tests (fixture, gating)

Per commit above. Coverage ≥ 85%; reported to Codecov from C1c.

### 8.2 Golden queries (real data, non-gating)

`pnpm search:golden`, each a separate `it`:

| Query                     | Expectation                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `ma`                      | first product contains a word starting `maito`                                                   |
| `maito`                   | first product is a 1 l milk; first category is "Maitotuotteet" (depth ≥ 1, never the top level)  |
| `juusto`                  | no top-level category among the results                                                          |
| `leipä`                   | first product has `leipä` as the end of a word; a bread category ("Leivät…" sub-category) listed |
| `leipa`                   | identical response to `leipä`                                                                    |
| `banaani`                 | first product `Pirkka banaani`; category "Banaanit"                                              |
| `kahvi`                   | first product is a ground coffee                                                                 |
| `creme fraiche`           | at least one product (accent folding)                                                            |
| `vessapaperi`             | ≥ 5 products (alias)                                                                             |
| `maito laktoositon`       | every product contains both                                                                      |
| `maito l`                 | every product has a word starting with `l`                                                       |
| `hedelmät ja vihannekset` | that category first                                                                              |
| every query               | tier 1 results precede tier 2 precede tier 3                                                     |

### 8.3 Bench (C18 PC, C27 phone)

Typing sequences, every prefix timed: `m ma mai mait maito`; `l le lei leip leipä`;
`j ja jau jauh jauheliha`; `v ve ves vessapaperi`; `maito l maito la maito laktoositon`;
**`maito laktoositonx`, `maito xyzq`, `pirkka zzz`** (multi-word no-match, review blocker 2);
`x xy xyz` (single-word no-match); `pesuaine`.

Report p50/p95/max of `engine.search`, keystroke → painted (C27), longest task during
tier 2–3 loading, and parse + `addTier` time per tier.

**Pass:** engine p95 < 5 ms, max < 15 ms; painted p95 < 50 ms; longest task < 50 ms; tier
1 ready < 500 ms. **Fail →** in order: (1) smaller chunks, (2) parse tier 3 in a worker
and transfer arrays, (3) a trigram prefilter on tier 3, (4) the §14 escape hatches. Each a
§17 decision.

---

## 9. Risks

| Risk                                                           | Mitigation                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Phone 20× slower than the PC                                   | The leapfrog bounds the worst case to one pass; tier 3 can move to a worker without an API change |
| `JSON.parse` of tier 3 (~1.4 MB raw) is one long task          | Measured in C27 (longest task); if > 50 ms, parse in a worker and transfer arrays                 |
| Aliases rot or contradict                                      | Validation; every alias needs a golden query or a failure-log line                                |
| Popular-but-wrong result (`omena` → a pomegranate yoghurt 2nd) | Accepted; the golden list grows from store runs                                                   |
| K-Ruoka renames or renumbers a category                        | Id constants with a name check, hard failure                                                      |
| Category results crowd out products                            | 3+ characters only, cap 3, ancestors dropped                                                      |
| Golden tests drift with re-scrapes                             | Non-gating by design; updated in the same commit as new data                                      |

---

## 10. C0: what changes in the committed `search.md`

1. §5.4: ranking is popularity only; drop "word start above compound match".
2. §5.1: no accent boost (drop "an exact match on the unfolded text scores higher"); fold
   with NFD; punctuation becomes a space, not removed (`wc-paperi` → `wc paperi`).
3. §5: 1–2 character words match word starts only, per word.
4. §4: there is no leaf "Maito"; deeper categories first, ancestors dropped when a
   descendant matches; group results need a 3+ character word.
5. §6: tier files carry `categoryIds`; the category page does not use
   `placements-primary.json`; add `category-rank.json`.
6. §3: food/clothing/uncategorised as id constants with a name check (already "matched on
   id", now says how).
7. §2 and §7 step 10: `scripts/build-search.ts` / `pnpm data:search` is the search half of
   `build-data.ts`, writing into `data/build/core/`.
8. §7 steps 4 and 6: module names (`query.ts`, `scan.ts`, `createSearchEngine` + `addTier`).
9. §8: test list matches §8.1–8.2 here; golden tests are non-gating.

---

## 11. Review findings: disposition

| Finding                                                                                                                              | Severity | Disposition                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| Word-start needle on the separator → wrong item, missed items                                                                        | blocker  | Fixed §4.2 (leading space per item, sentinel), tests C4                 |
| Verify step scans past the item: 32–176 ms on two-word queries                                                                       | blocker  | Fixed §4.4 (leapfrog); bench cases §8.3                                 |
| Memo hides new tiers; `loadedTiers` dep                                                                                              | blocker  | Memo removed; `getVersion` + `useSyncExternalStore` §4.5, §5.2; test C8 |
| `rankedCount` order puts top-level categories first                                                                                  | blocker  | Fixed §4.6 (ancestor drop, depth desc, `categoryRank`); golden §8.2     |
| `fold()` breaks accented names                                                                                                       | major    | Fixed §4.1 (NFD on demand, extra letters, zero-width)                   |
| Typo vocabulary built during a keystroke                                                                                             | major    | Fixed §4.8 (idle, after tier 3)                                         |
| `addTier` tier 3 blocks main thread                                                                                                  | major    | Fixed §4.2 (chunked); measured C27                                      |
| Show more vs tier arrival; cursor while pending                                                                                      | major    | Fixed §4.5, §5.2 (`shown` limit; pending cursor)                        |
| `topEans` can't be shown                                                                                                             | major    | Fixed §4.5 (`topProducts`, EAN map, loaded only)                        |
| Architecture doc updated three PRs late                                                                                              | major    | Fixed: C1b in PR 1, C1e in PR 2, C33 after measurement                  |
| Contradictions with `search.md`                                                                                                      | major    | C0, §10 (9 items)                                                       |
| Commits that don't stand alone (C1 no tests, Codecov, `./build` export, root deps, scripts typecheck, web vitest, fixtures, `mitao`) | major    | Fixed in C1, C1c, C13–C13c, C19, C4, C30                                |
| Rule A: restated types, schemas, comparator, categories file                                                                         | major    | Fixed §3.0, C1d, C13b                                                   |
| Rule C: one-sided thresholds; golden tests on live data                                                                              | major    | Both sides listed per commit; golden non-gating §8.2                    |
| Subsumption wrong in word-start mode                                                                                                 | minor    | Fixed §4.3 step 4                                                       |
| Mode per query, not per word                                                                                                         | minor    | Fixed §1.2, §4.3 step 2                                                 |
| "Exact whole-word" category exception untested                                                                                       | minor    | Dropped §1.4                                                            |
| Highlight mapping claim wrong                                                                                                        | minor    | Fixed `foldWithOffsets` §4.1, §5.3                                      |
| Alias keys with spaces                                                                                                               | minor    | Validation rule §3.3                                                    |
| Missing "no uncategorised in tiers 1–2" invariant                                                                                    | minor    | Added §6                                                                |
| Build checks untested in `scripts/`                                                                                                  | minor    | Moved to `build/validate.ts`, C12                                       |
| Bench doesn't measure painted time; ships to prod                                                                                    | minor    | C27 measures keystroke → painted, lazy behind DEV                       |
| Accessibility of "Add" buttons and loading note                                                                                      | minor    | `aria-label`s, `aria-live` §5.1, §5.3                                   |

Two judgement calls to confirm:

- **Moving `compareStrings` into `packages/core`** and exporting the scraper's schemas
  (C1d, C13b) touches two packages for reuse. The alternative is duplicating ~20 lines.
  Reuse chosen, per Rule A.
- **C6's "one pass" property** is asserted through cursor logic on a fixture, not a timing
  test, to stay deterministic (Rule C); the timing is the bench's job.
