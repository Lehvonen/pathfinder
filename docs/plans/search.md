# Plan: search engine

**Status:** planned, nothing built
**Architecture refs:** §6 (generic entries, popularity), §7 step 5 (prebuilt indexes),
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

| Finding                                                                | Number                        | Consequence                                                                       |
| ---------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Searchable products                                                    | 39,479                        | Names only; brand is already part of most names                                   |
| …in the 14 food top-level categories / the other 13                    | 19,415 / 20,064               | The split the tiers in §3 are built on                                            |
| Name length                                                            | 41 chars average, 1.6 M total | The whole name list is small enough to scan                                       |
| Products with a popularity score                                       | 28,886 (73%)                  | The rest sort last, by name (§6)                                                  |
| Share of total popularity in the top 1k / 2k / 5k / 10k                | 47% / 61% / 82% / 94%         | Matches §10's "top 5,000 ≈ 81%"                                                   |
| "leipä": names containing it / names with a word **starting** with it  | 462 / 87                      | **Finnish compounds: infix matching is required.** Word-prefix misses `ruisleipä` |
| "maito": containing / word-prefix                                      | 347 / 250                     | Same: `kevytmaito`, `rasvaton maito`                                              |
| "maito" substring matches, sorted by popularity                        | top 3 are all 1 l milks       | **Popularity alone already passes the "milk first" target** (§14)                 |
| Inflected forms (`maitoa`, `maidon`) in names                          | 41                            | Rare in names. Inflection is a query-side problem, handled by aliases             |
| Linear `String.includes` over every name, per query, laptop            | ~2 ms                         | A phone 10× slower is still inside the 50 ms target, before any index             |
| Distinct infix substrings (what a FlexSearch `full` tokenizer indexes) | ~490,000                      | A prebuilt infix index is large; the size may not fit the 3 MB core budget        |
| Distinct trigrams                                                      | ~9,500                        | A trigram index would be small, if one is needed at all                           |
| Categories                                                             | 1,042, 27 top-level           | Clean K-Ruoka names: what group results are made of (§4)                          |
| Store departments                                                      | 202                           | Internal names like "(KT 1) Taloustavara": never shown or searched                |

The infix rows matter most. §17 decided on prebuilt FlexSearch indexes because "index
build at startup … is what misses the target at 50k products on an old phone". At 39k
products a scan needs no index build at all. Before adding FlexSearch, **measure the scan
on the oldest team phone** (step 7). FlexSearch stays the plan unless the numbers say
otherwise; changing that is a §17 decision, not a quiet swap.

## 2. Where the code lives

A new workspace package, **`packages/search`**: framework-free TypeScript, unit-tested,
used by the web app at runtime and by `scripts/build-data.ts` at build time.

Not `packages/core`, because search will likely pull in a dependency (FlexSearch) that
the router does not need, and `core` stays small. Not `apps/web`, because the build
script needs the same normalisation and tiering code as the runtime, or queries and the
data stop agreeing. _(Needs agreement: §5 does not list this package yet.)_

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
or 2, and neither does "uncategorised". Both lists are named constants in `tiers.ts`,
matched on category id, not name.

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
  "hedelmät ja vihannekset", "banaanit", "maito". Category results are listed above
  product results (§10: a category match is a strong result).
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

1. **Normalise**, applied identically to names at build time and to queries at runtime:
   lowercase, collapse whitespace, strip punctuation except digits and units. Fold `ä→a`,
   `ö→o`, `å→a` **for matching only**, so `leipa` finds `leipä` on a keyboard without
   Finnish letters. An exact match on the unfolded text scores higher.
2. **Aliases** (`aliases.json`, hand-maintained): map a query to one or more search terms,
   e.g. `maitoa → maito`, `kevari → kevytmaito`, `jogu → jogurtti`. Applied to whole
   query words before matching.
3. **Match** every query word as an infix of the normalised name. All words must match
   (AND), so `maito laktoositon` narrows rather than widens.
4. **Rank**, within categories and within each tier:
   1. a match at the start of a word above one in the middle of a compound
   2. popularity, descending; unranked products last
   3. shorter name first, then EAN (or category id), so the order is deterministic and
      testable
5. Show matching categories first, then tier 1, 2 and 3 results as each tier finishes,
   ~20 visible at a time. Category results carry the top SKUs from `category-top.json`.

## 6. Data it needs

| File                     | Built from                                    | Tier | Notes                                                                  |
| ------------------------ | --------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| search entries / indexes | `products.json`, `popularity.json`            | core | Payload `{ ean, name }` (§17); one chunk per tier, pre-sorted          |
| `category-top.json`      | `products.json`, `popularity.json`            | core | `categoryId → [ean, …]`, top ~10 per category (§7 step 5)              |
| `categories.json`        | already in `data/normalised/`                 | core | Category names are searched for group results (§4)                     |
| `aliases.json`           | `data/curation/aliases.json`, hand-maintained | core | Starts with ~20 entries from the profiling queries; grown continuously |

Pre-sorting each tier by popularity at build time means the scan finds results already in
rank order and can stop early once it has enough of them. That is most of the speed for
one-letter queries, which match thousands of names.

The category page (§4) needs each product's category. The search payload stays
`{ ean, name }`; the category id comes from `placements-primary.json`, already core.

## 7. Steps

Each step is one or two atomic commits, a source file with its test.

1. **Package skeleton**: `packages/search` with `package.json`, `tsconfig.json`, vitest,
   wired into the workspace. No code.
2. **`normalise.ts`**: the text normalisation in §5.1, with tests on real names
   (`Täysjyväruisleipä`, `1l`, `n.36 kpl/pak`, double spaces).
3. **`tiers.ts`**: the food and clothing lists and the split in §3, as a pure function
   from products, categories and popularity to three ordered lists. Tests pin the share
   arithmetic, spare places moving on, food leftovers filling tier 2 before non-food,
   clothing never in tiers 1–2, and unranked products landing in tier 3.
4. **`match.ts`** + **`rank.ts`**: infix AND match and the ranking order, as pure functions
   over a small fixture. Tests pin compound matches and deterministic tie-breaks.
5. **`categories.ts`**: category-name matching for group results, and `searchWithin`.
6. **`search.ts`**: the public API, `createSearch({ tiers, categories, aliases })` →
   results delivered tier by tier. This is the Track E "`String.includes` … good enough
   for the first store run", except it is built to stay.
7. **Measure**: a bench script over the real `data/normalised/` with the §14 queries
   (`m`, `ma`, `mai`, `maito`, …). Record laptop numbers here, then run it in a page on the
   oldest team phone. **Decision point:** if every keystroke is under 50 ms, propose in
   §17 that the scan replaces FlexSearch; if not, go to step 8.
8. **Index**, only if step 7 needs it: FlexSearch with a custom tokenizer, or a trigram
   index, one per tier, chosen on measured size against the 3 MB core budget. Prebuilt
   and exported by `build-data.ts` (§7 step 5).
9. **Typo tolerance**: edit distance 1 on query words of five or more letters, only when the
   exact search returns fewer than ~5 results, so it never pushes a correct match down.
10. **Build output**: `build-data.ts` writes the tiers, `category-top.json` and
    `aliases.json` into `data/build/core/`. This overlaps the Track B `data:build` card;
    coordinate with whoever holds it.
11. **Web Worker** in `apps/web`, so search never blocks typing. Only if step 7 shows the
    main thread is the bottleneck.

Steps 1–6 are usable on their own: the app can search the real catalogue as soon as they
are merged. The architecture doc changes (§10 tiers, §11 category page, §17 hot-index
size) are one separate commit after this plan.

## 8. Tests that matter

- **The §14 target as a test**: over the real catalogue, `m`, `ma`, `mai` and `maito`
  put a milk product or the "Maito" category first. Runs against `data/normalised/` and
  is skipped if the file is missing.
- Compounds: `leipä` finds `ruisleipä`; `maito` finds `kevytmaito`.
- Folding: `leipa` and `leipä` return the same set; the `ä` query ranks exact matches first.
- AND: `maito laktoositon` returns only names containing both.
- Category names: `maito` does not boost a product whose name lacks "maito";
  `hedelmät ja vihannekset` returns that category as a group result.
- Tiers: results from a later tier never appear above results from an earlier one.
- Determinism: the same query on the same data always returns the same order.
- Unranked products never outrank ranked ones within a tier.

## 9. Open questions

- **Non-food share in tier 2** — 125 places per category is the top few percent of
  Kosmetiikka (4,236 ranked) or Lemmikit (1,394). Fine if the tier sizes are only a
  load-order tool; revisit after step 7 if common non-food searches feel slow.
- **Scan vs index** — decided by step 7's phone measurement, recorded in §17.
- **Which categories match**: should "maito" also show the top-level "Maito, juusto,
  munat ja rasvat"? Probably cap group results at ~3, preferring exact name matches, then
  deeper categories. To decide with a few real lists in step 5.
- **Brand-only queries** ("valio"): brand is in most names already, so they work through
  the name match. Indexing `brand` separately would need the display tier; not planned.
