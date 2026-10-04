# Plan: search engine

**Status:** steps 1–6 built (engine, categories, tiers, build); PC numbers in §10. Web app,
phone measurement and typo tolerance (steps 7–9) to do
**Architecture refs:** §6 (generic entries, popularity), §7 step 5 (search build),
§10 (search), §11 (frontend), §14 (budget, performance targets), §17 (search decisions)
**Covers checklist items:** Track E, except "Single-item lookup → map pin" (needs the map)

Search turns what a shopper types into list entries: a **generic** entry for a category
("maito") or a **product** entry for one EAN. It runs in the browser, offline, on every
keystroke, and the shopper sees results while still typing. It does **not** need the map:
everything it reads is already in `data/normalised/`, so this work can run ahead of
Track C.

---

## 1. What the data says

Profiled on 2026-10-04 from `data/normalised/` (scrape of 2026-10-03).

| Finding                                                                   | Number                         | Consequence                                                                        |
| ------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Searchable products                                                       | 39,479                         | Names only; brand is already part of most names                                    |
| …in the 14 food top-level categories / the other 13                       | 19,415 / 20,064                | The split the tiers in §3 are built on                                             |
| Name length                                                               | 41 chars average, 1.6 M total  | The whole name list is small enough to scan                                        |
| Products with a popularity score                                          | 28,886 (73%)                   | The rest sort last, by name (§6)                                                   |
| Share of total popularity in the top 1k / 2k / 5k / 10k                   | 47% / 61% / 82% / 94%          | Matches §10's "top 5,000 ≈ 81%"                                                    |
| "leipä": names containing it / names with a word **starting** with it     | 462 / 87                       | **Finnish compounds: infix matching is required.** Word-prefix misses `ruisleipä`  |
| "maito": containing / word-prefix                                         | 347 / 250                      | Same: `kevytmaito`, `rasvaton maito`                                               |
| "maito" substring matches, sorted by popularity                           | top 3 are all 1 l milks        | **Popularity alone already passes the "milk first" target** (§14)                  |
| Inflected forms (`maitoa`, `maidon`) in names                             | 41                             | Rare in names. Inflection is a query-side problem, handled by aliases              |
| Ranking `leipä` / `pesuaine` with word-start matches first                | `leipäjuusto` / a rarer soap   | **Rank by popularity only.** The product is the last part of a compound (§5)       |
| 1–2 letter words matched anywhere: `m` → 29,147 names, top `Kurkku Suomi` | `ma` word-start → a milk first | **Words of 1–2 letters match word starts only** (§5)                               |
| Names with accents beyond ä/ö/å (`crème fraîche`, `Jamón`, `ø`)           | ~220                           | Fold with Unicode decomposition, not a hand-written table (§5)                     |
| Linear `String.includes` over every name, per query, PC                   | ~2 ms                          | A phone 10× slower is still inside the 50 ms target, before any index              |
| Distinct infix substrings (what a FlexSearch `full` tokenizer indexes)    | ~490,000                       | A prebuilt infix index is large; the size may not fit the 3 MB core budget         |
| Distinct trigrams                                                         | ~9,500                         | A trigram index would be small, if one is needed at all                            |
| Categories                                                                | 1,042, 27 top-level            | Clean K-Ruoka names: what group results are made of (§4)                           |
| Category names are plural: `leipä` vs "Leivät", `olut` vs "Oluet"         | no match without aliases       | Aliases apply to category names too (§4)                                           |
| A leaf category called "Maito"                                            | none                           | `maito` matches "Maitotuotteet" and the top-level "Maito, juusto, munat ja rasvat" |
| Store departments                                                         | 202                            | Internal names like "(KT 1) Taloustavara": never shown or searched                 |

The infix rows matter most. §17 decided on prebuilt FlexSearch indexes because "index
build at startup … is what misses the target at 50k products on an old phone". At 39k
products a scan needs no index build at all, provided the scan reads the list at most
once per query word, however many words are typed (§5.3). Before adding FlexSearch,
**measure the scan on the oldest team phone** (step 8). FlexSearch stays the plan unless
the numbers say otherwise; changing that is a §17 decision, not a quiet swap.

## 2. Where the code lives

A new workspace package, **`packages/search`**: framework-free TypeScript, unit-tested,
used by the web app at runtime and by the data build. Its build-time half is a separate
export, `@pathfinder/search/build`, so the web app never bundles it.

Not `packages/core`, because search will likely pull in a dependency (FlexSearch) that
the router does not need, and `core` stays small. Not `apps/web`, because the build
script needs the same normalisation and tiering code as the runtime, or queries and the
data stop agreeing. _(Needs agreement: §5 does not list this package yet.)_

The search build runs as `pnpm data:search` (`scripts/build-search.ts`, Node via `tsx`).
It is the search half of the planned `scripts/build-data.ts`: when `data:build` is
written, it calls the same functions, and both write into `data/build/core/`.

## 3. Three tiers

_Agreed 2026-10-04. Replaces §10's two indexes (hot and full) and answers the §17
"hot-index size" question; both need updating in the architecture doc._

Products are split into three tiers at build time. Search goes through them in order, so
the most likely products are found first and shown while the rest are still being
searched.

| Tier         | Contains                                                                                                                    | Size    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| **1 — hot**  | Most popular **food** products, an equal share per food top-level category                                                  | ~8,000  |
| **2 — warm** | Every other ranked **food** product, topped up with the most popular **non-clothing** products, an equal share per category | ~10,000 |
| **3 — rest** | Everything else: non-food beyond its share, all clothing and shoes, and every unranked product                              | ~21,500 |

**Food** is these 14 top-level categories: Juomat; Kuivat elintarvikkeet ja leivonta;
Maito, juusto, munat ja rasvat; Makeiset ja naposteltavat; Leivät, keksit ja leivonnaiset;
Liha ja kasviproteiinit; Pakasteet; Mausteet ja maustaminen; Valmisruoka; Säilykkeet,
keitot ja ateria-ainekset; Texmex ja maailman maut; Hedelmät ja vihannekset; Öljyt, etikat
ja salaattikastikkeet; Kala ja merenelävät. Lapset and Lemmikit are non-food.

**Clothing** is Vaatteet ja asusteet and Kengät ja kenkienhoito. It never enters tiers 1
or 2, and neither does "uncategorised". The food, clothing and uncategorised lists are
category id constants in `tiers.ts` (ids are stable: `category-ids.json` is append-only).
The build checks that each id still has the expected name and fails if not, so a K-Ruoka
rename is caught instead of silently moving products between tiers.

**Equal share** means each category gets `size ÷ categories` places, and a category with
fewer ranked products than that gives its spare places to the others, repeated until the
tier is full. Only ranked products enter tiers 1 and 2. On the current data:

- Tier 1: 630 per food category. Texmex (627), Hedelmät ja vihannekset (584), Öljyt (292)
  and Kala (194) fit whole.
- Tier 2: first the 8,618 ranked food products left over from tier 1, so every popular
  food product is found before any non-food one. The remaining ~1,380 places go to the 11
  non-clothing, non-food categories with the same equal share: 125 each.
- Tier 3: 21,489 products, of which 10,593 are unranked.

**How results appear.** Tier 1 is searched first and its results render at once. Tiers 2
and 3 follow automatically, without the shopper doing anything, and their results are
**appended below** what is already shown. The visible list never reshuffles under the
shopper's thumb. Within a tier, results are ranked as in §5.

**The tiers work the same with or without an index.** With a scan, a tier is a slice of
the pre-sorted product list. With an index, each tier is its own prebuilt index file and
tier 1 is §10's hot index.

## 4. Group results: categories

_Agreed 2026-10-04._

- **Category names never affect product search.** A product matches on its own name only;
  sitting in "Maito, juusto, munat ja rasvat" does not make it rank higher for "maito".
- **A category is a result only when the query matches the category's name**, e.g.
  "hedelmät ja vihannekset", "banaanit", "maito", and only once a query word has 3+
  letters (`m` alone matches 410 category names). Aliases apply, so `leipä` finds
  "Leivät". Category results are listed above product results (§10: a category match is
  a strong result), at most 3.
- **The most specific category wins.** When both a category and one of its descendants
  match, the ancestor is dropped; the rest are ordered by how exactly the name matches,
  then deeper first, then by the popularity of their best product. `maito` gives
  "Maitotuotteet", not all of dairy, so "add maito" does not become "add the whole dairy
  department".
- **Categories, not store departments.** The 1,042 K-Ruoka categories have names
  shoppers recognise; the store's department names are internal and never searched.
- **A category result has two actions:**
  - **add as a generic entry** ("maito, any"), which resolves through `CategoryPlacement`
    before routing (§6), unchanged
  - **open the category page**: every product in that category and its sub-categories,
    sorted by popularity, with **its own search bar** that searches only within it. The
    engine exposes this as `searchWithin(categoryId, query)`; the page is §11 work.

## 5. The pipeline

```
query ──► normalise ──► aliases ──► match ──► rank ──► categories, then tier 1, 2, 3
                         (§10)    scan now,   popularity
                                  index later
```

1. **Normalise**, applied identically to names and queries: remove zero-width
   characters, decompose accents and drop them (`crème` → `creme`, `ä` → `a`, `ö` → `o`,
   plus `ø`, `æ`, `ß`, which do not decompose), lowercase, turn every other character into
   a space (`wc-paperi` → `wc paperi`), collapse spaces. `leipa` and `leipä` are the same
   query; there is **no** extra score for typing the ä, because any boost would break the
   pre-sorted order the scan relies on.
2. **Aliases** (`aliases.json`, hand-maintained): map a query to one or more search terms,
   e.g. `maitoa → maito`, `kevari → kevytmaito`, `jogu → jogurtti`. Applied to whole
   query words; the word still being typed also picks up aliases whose key starts with
   it, once it has 4+ letters (`vessap` already finds `wc-paperi`). Aliases widen what
   matches; they do not boost.
3. **Match.** A query word of 3+ letters matches anywhere in the name (`maito` finds
   `kevytmaito`); a word of 1–2 letters matches only at the start of a word, decided per
   word, so `maito l` narrows to names with a word starting with `l` rather than every
   `1l`. All words must match (AND), so `maito laktoositon` narrows rather than widens.
   The scan reads each tier at most once per query word, however many words there are,
   so a typo in the second word cannot make a keystroke slow.
4. **Rank by popularity only**, which is the order the tiers are stored in: ranked before
   unranked, popularity descending, then shorter name, then EAN, so the order is
   deterministic. Ranking word-start matches first was rejected on real data: it puts
   `leipäjuusto` (cheese) above `ruisleipä` (bread) for `leipä`, because in Finnish the
   product is the last part of a compound. Since scan order is rank order, the scan stops
   at the 20th match.
5. Show matching categories first, then tier 1, 2 and 3 results as each tier loads,
   20 at a time with "show more". Category results show up to three example products from
   `category-top.json`, filling in as the tiers holding them load. No result count: it
   would need a full scan per keystroke.

## 6. Data it needs

| File                       | Built from                                    | Tier | Notes                                                                       |
| -------------------------- | --------------------------------------------- | ---- | --------------------------------------------------------------------------- |
| `search-tier-{1,2,3}.json` | `products.json`, `popularity.json`            | core | Columnar `{ eans, names, categoryIds }`, pre-sorted; ~850 KB gzipped in all |
| `category-top.json`        | `products.json`, `popularity.json`            | core | `categoryId → [ean, …]`, top 10 per category subtree (§7 step 5)            |
| `category-rank.json`       | `products.json`, `popularity.json`            | core | `categoryId →` rank of its best product; orders category results (§4)       |
| `categories.json`          | `data/normalised/categories.json`             | core | The one core categories file; names searched for group results (§4)         |
| `aliases.json`             | `data/curation/aliases.json`, hand-maintained | core | Starts with ~20 entries from the profiling queries; grown continuously      |

Pre-sorting each tier by popularity at build time means the scan finds results already in
rank order and can stop early once it has enough of them. That is most of the speed for
one-letter queries, which match thousands of names.

The category page (§4) needs each product's category, so the tier files carry
`categoryIds` alongside §17's `{ ean, name }` payload: 49 KB gzipped, and it keeps search
independent of `placements-primary.json`, which cannot be built until the graph exists.
Recorded as a §17 change.

## 7. Steps

Each step is a handful of atomic commits, a source file with its test.

1. **Package skeleton**: `packages/search` with `package.json` (exports `"."` and
   `"./build"`), `tsconfig.json`, vitest, Codecov upload. No code.
2. **`normalise.ts`**: the normalisation in §5.1, with tests on real names
   (`Täysjyväruisleipä`, `Crème fraîche`, `n.36 kpl/pak`, `Rustico-leipä`, a decomposed ä).
3. **`haystack.ts`** + **`query.ts`** + **`scan.ts`**: each tier's names joined into one
   searchable string, the query parsed into words with their aliases and matching rule,
   and the scan that stops at the `limit`-th match (§5.3–5.4).
4. **`categories.ts`**: category matching and ordering (§4), and the category-page filter.
5. **`engine.ts`**: the public API, `createSearchEngine(…)` with `addTier`, `search`,
   `searchMore` and `searchWithin`. Tiers are added as they load, in small pieces so typing
   never freezes. This is the Track E "`String.includes` … good enough for the first store
   run", except it is built to stay.
6. **Build**: `build/tiers.ts` (the split in §3), `category-top`, the tier files, and the
   build checks, then `scripts/build-search.ts` writing into `data/build/core/`. This
   overlaps the Track B `data:build` card; coordinate with whoever holds it.
7. **Web app**: data loading, the search bar, product and category results, and the
   category page.
8. **Measure**: a bench over the real data with typing sequences (`m`, `ma`, `mai`,
   `maito`, multi-word typos like `maito laktoositonx`): `pnpm bench:search`, PC numbers in
   §10. Then
   run it in the web app on the oldest team phone, measuring keystroke → results painted
   and the longest freeze while tiers load. **Decision point:** if every keystroke is under
   50 ms, propose in §17 that the scan replaces FlexSearch; if not, try a worker or an
   index, each a §17 decision.
9. **Typo tolerance**: edit distance 1 on query words of five or more letters, only when the
   exact search returns fewer than 5 results and no categories, so it never pushes a
   correct match down. Its word list is built in idle time after tier 3 loads, never
   during a keystroke.

Steps 1–5 give a working, tested engine; step 6 feeds it real data. The architecture doc
changes land in the same PRs as the code they describe: §5 and the §17 decisions with the
engine, §7, §14 and §15 with the build.

## 8. Tests that matter

Unit tests run on a hand-written fixture and gate CI. Tests on the real catalogue
(`pnpm search:golden`) are **not** part of `pnpm test`: a re-scrape changes the data, and
CI must not go red because a store moved its milk. They run after `pnpm data:search` and
are updated in the same commit as new data.

On the real catalogue:

- **The §14 target**: `ma` and `maito` put a milk first; `maito`'s first category is
  "Maitotuotteet", never a top-level category.
- Compounds: `leipä` finds `ruisleipä` first; `maito` finds `kevytmaito`.
- Folding: `leipa` and `leipä` return identical results; `creme fraiche` finds products.
- Aliases: `vessapaperi` finds at least 5 products.
- AND: `maito laktoositon` returns only names containing both; `maito l` only names with
  a word starting with `l`.
- Category names: `hedelmät ja vihannekset` returns that category first.
- Tiers: results from a later tier never appear above results from an earlier one.

On the fixture, every threshold is tested on both sides: 2 vs 3 letters, 3 vs 4 letters
for alias prefixes, 3 vs 4 matching categories, 4 vs 5 letters and 4 vs 5 results for
typo correction, and exactly 20 matches ending on a tier's last item. Also: adding a tier
only appends to the results of an unchanged query; the same query on the same data always
returns the same order; unranked products never outrank ranked ones.

## 9. Open questions

- **Non-food share in tier 2** — 125 places per category is the top few percent of
  Kosmetiikka (4,236 ranked) or Lemmikit (1,394). Fine if the tier sizes are only a
  load-order tool; revisit after step 8 if common non-food searches feel slow.
- **Scan vs index** — decided by step 8's phone measurement, recorded in §17.
- **Brand-only queries** ("valio"): brand is in most names already, so they work through
  the name match. Indexing `brand` separately would need the display tier; not planned.

## 10. PC measurements

`pnpm bench:search` on the development PC, 2026-10-04, over the committed
`data/build/core/` (scrape of 2026-10-03, 39,479 products). It types 12 sequences one
character at a time, 50 runs per keystroke, and times `engine.search` only; rendering is
measured on the phone in step 8.

**Loading** (parse + index, as the app will):

| Tier | Products | Gzipped | Parse  | Index   |
| ---- | -------- | ------- | ------ | ------- |
| 1    | 7,997    | 149 KB  | 2.3 ms | 9.2 ms  |
| 2    | 9,993    | 212 KB  | 2.3 ms | 11.2 ms |
| 3    | 21,489   | 480 KB  | 4.8 ms | 24.6 ms |

Search is usable ~12 ms after tier 1 arrives; all search files are 896 KB gzipped, against
the 1 MB the build allows.

**Per keystroke**, all 12 sequences together:

| Version                                        | p50      | p95      | max      |
| ---------------------------------------------- | -------- | -------- | -------- |
| First build                                    | 0.333 ms | 1.372 ms | 2.692 ms |
| Short words found without searching for spaces | 0.335 ms | 1.096 ms | 1.756 ms |
| Category strings built once                    | 0.054 ms | 0.792 ms | 1.479 ms |

What changed:

- **Short words.** A 1–2 letter word was searched as `" " + word`, which stops at every
  space in the text. Searching for the word and checking the character before it made a
  short word that matches nothing ~30× faster (`pirkka zzz` p95: 2.44 → 0.34 ms).
- **Category strings.** Every keystroke built 1,042 category strings; building them once
  made the typical keystroke 6× faster (p50: 0.333 → 0.054 ms).

Slowest sequence now: `vessapaperi`, p95 1.3 ms. While "vess…" is typed, the scan passes over
the text for several alias terms before it finds a match.

At 10× slower, a typical old phone would see p95 ≈ 8 ms: inside the 50 ms
keystroke → results target, slightly above this plan's 5 ms engine budget. The phone run in
step 8 decides whether anything more is needed.
