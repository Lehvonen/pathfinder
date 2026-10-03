# Plan: data cleaner (`normalise.ts`)

**Status:** in progress: rules, categories, departments, validation, report and CLI
implemented; the reviewed department table and the first committed output are pending
**Architecture refs:** §6 (data model), §7 step 2 (normalise), §13 Track B, §14 (budget)
**Covers checklist items:** "`normalise.ts` — raw → schema" and "Full scrape reviewed by hand
for junk, duplicates, missing shelves"

The cleaner turns the raw scrape in `scraper/cache/kupittaa/` into records shaped like
`packages/core/src/types.ts`, plus a report a person reads. It does **not** need the map:
matching shelf IDs against `graph.json` (§7 step 3) is a later, separate step.

---

## 1. What the first full scrape actually contains

Profiled on 2026-10-03 from `queue.json` (42,961 products) and `products.ndjson` (42,961
lines). These numbers drive every rule below.

| Finding                                                                                             | Count           | Consequence for the cleaner                                           |
| --------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------- |
| EANs: all 13 digits, unique in both files                                                           | 42,961          | Dedup is a guard, not a fix. Keep it anyway for re-scrapes            |
| Fetch errors                                                                                        | 0               | —                                                                     |
| **Fresh produce (`Hedelmät ja vihannekset`) missing**                                               | whole category  | **Scraper gap, fix in parallel** (§2)                                 |
| No location at all                                                                                  | 3,984           | Mostly clothing and shoes, web-shop only                              |
| Location object but `department: null`                                                              | 22              | Treat as no location                                                  |
| Located, but shelf `00` ("department only")                                                         | 18,993 (49%)    | Must be routable to a department, not dropped                         |
| Shelf known, level `0`                                                                              | 127             | `shelfLevel` left undefined                                           |
| Departments                                                                                         | 192             | Small enough to curate by hand                                        |
| …of which `isPublic: false`                                                                         | 30              | Internal labels. Some are real aisles (milk is one), so not a filter  |
| …junk or back-room ("Keräys- ja toimituskoodit", "JÄTÄ SUORAAN PUUTTEEKSI!", "V2 takaa kerättävät") | ~10 departments | Excluded through a curated list, not by pattern                       |
| `isAvailable: false`                                                                                | 125             | Almost all Pirkka shopping bags                                       |
| Brand present in `queue.json` but `null` in `products.ndjson`                                       | 3,952           | Take brand from the queue                                             |
| No brand anywhere                                                                                   | ~3,600          | `brand` stays optional                                                |
| No `categoryPath`                                                                                   | 7               | Fall back to an "uncategorised" category, reported                    |
| K-Ruoka categories: 26 top-level, 843 leaves, always 3 deep                                         | —               | Source for `Category`                                                 |
| Names with double or trailing spaces                                                                | 617             | Collapse whitespace                                                   |
| Same name, different EAN                                                                            | 785 groups      | 501 are clothing sizes. Not duplicates: EAN is the key. Reported only |
| `location.segment`                                                                                  | 1,506 values    | Not 1:1 with shelf; meaning unknown. Dropped                          |

## 2. In parallel: scrape fresh produce

K-Ruoka's category aggregation (`aggregations.json`) has no produce category, so the
listing never queued it. A live lookup confirms the products exist with locations:
`Pirkka banaani`, EAN `2000818700008`, `(HEVI) Massapaikat, Rivi 2`, shelf 03, level 0.
Produce uses in-store `2…` EANs, which are valid and stable.

Bananas, tomatoes and cucumbers are on almost every real shopping list, so the demo fails
without them. This doesn't block building the cleaner: it reads whatever is in the cache, so
produce only changes its output. New produce departments appear as skeleton rows in the
curation table (§5), and new categories get appended ids. It does block **using** the
output for the demo or routing tests. Run alongside the cleaner work:

```
EXTRA_CATEGORIES=hedelmat-ja-vihannekset bun run scraper/export-kupittaa.ts extra
bun run scraper/export-kupittaa.ts scrape
```

Check the slug in the k-ruoka.fi address bar first. While there, compare the site's
top-level category menu with the 26 in §1 to catch any other category missing the same way.

## 3. Inputs and outputs

**Inputs** (read-only):

- `scraper/cache/kupittaa/queue.json`: name, brand, categoryPath, popularity
- `scraper/cache/kupittaa/products.ndjson`: location, isAvailable
- `data/curation/departments.json`: hand-maintained, see §5; new departments are added to
  it as unreviewed rows
- `data/curation/categories.json`: optional, `categoryPath → temperature` overrides
- `data/curation/category-names.json`: optional, `categoryPath → display name`
- `data/normalised/category-ids.json`: the id registry from the previous run, read back

Every input is checked against a Zod schema before anything is written; a malformed file
stops the run with its name and the first problems.

**Outputs** in `data/normalised/`, **committed**:

| File                | Shape                                                                | Used by                                      |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `products.json`     | `Product[]`, sorted by EAN                                           | `build-data.ts` → display tier, search index |
| `placements.json`   | `Placement[]`, one primary per product                               | shelf matching, `build-data.ts`              |
| `categories.json`   | `Category[]`, with `parentId` and `temperature`                      | core tier                                    |
| `category-ids.json` | `categoryPath → id`, **append-only**                                 | keeps ids stable across scrapes              |
| `popularity.json`   | `EAN → score \| null` (0 → `null`, §6)                               | `build-data.ts` only, never shipped          |
| `departments.json`  | the reviewed row, `orderNumber`, `zone`, shelves seen, product count | map editor, unmatched-shelf handoff          |
| `report.md`         | exclusions by reason, warnings, per-department stats                 | the "reviewed by hand" step                  |

**Why commit `data/normalised/`:** the raw cache is gitignored and exists on one laptop.
Committing the cleaned output gives the other five people real data without an 18-hour
scrape. It's also the baseline `diff.ts` compares against. It should be a few MB of JSON.

**Why `category-ids.json` is append-only:** category ids are interned integers (§14), and
generic list entries store `categoryId` in saved lists and share links. If a re-scrape
renumbered the categories, saved lists would quietly point at the wrong category.

## 4. Rules, in order

1. **Join** queue and ndjson on EAN. The queue is the source for name, brand, categoryPath
   and popularity; a missing or blank queued value falls back to the ndjson. The ndjson is
   the source for location and availability. Last one wins for a repeated EAN in either
   file, and the repeat is logged (`duplicate-record`, `duplicate-queue-entry`), as are
   products queued but not fetched (`not-fetched`), fetched but not queued
   (`not-queued`) and damaged ndjson lines (`damaged-line`). These are load issues, not
   exclusions.
2. **Validate the EAN**: 8, 12, 13 or 14 digits. Otherwise exclude with `bad-ean`.
3. **Exclude**, each with a reason that appears in the report; the first that applies wins:
   - `no-name`: name missing or blank
   - `no-location`: `location` null, or department null
   - `unavailable`: `isAvailable: false`
   - `junk-department` / `backroom-department`: per the curated table
4. **Clean text**: trim and collapse whitespace in name and brand. An empty brand becomes
   undefined. Names are not otherwise rewritten. Search normalisation belongs to
   `build-data.ts`.
5. **Shelf ID** = `<departmentId>:<shelf>`, e.g. `91208:05`. Shelf numbers repeat in every
   department, so the shelf number alone isn't an ID. Shelf `00` stays as `<dept>:00`, the
   **department-wide shelf**: the map draws one polygon for the department area with that
   ID. This routes "department only" products without changing `types.ts`. The K-Ruoka
   department id is used rather than the name, because names carry notes like
   "KORVAA ITSE" that change.
6. **`shelfLevel`** = the level as a number, or undefined when it is `0`, not a number, or
   on the department-wide shelf (a level means nothing without a shelf).
7. **Placement**: exactly one per product, `isPrimary: true`. The scrape returns one
   location per EAN, so secondary placements don't exist yet. The type keeps room for them.
8. **Category**: the leaf of `categoryPath`, with parents built from the path. A new
   path gets the next id in `category-ids.json`. Empty segments (an empty path, stray
   slashes) are dropped; a missing or empty path gets `uncategorised`.
9. **Temperature** per category: the majority temperature of its products' departments,
   from the curated table; a tie goes to the colder one. A manual override in
   `data/curation/categories.json` wins for that category, and **travels upward only**:
   each product votes with the deepest override on its path from its own category up, so
   the parents of an overridden leaf follow it, but a parent's override never changes the
   categories below it. A category whose (effective) votes split across temperatures is
   reported as mixed, unless it is overridden.
10. **Popularity**: `0` → `null`, otherwise the score.
11. **Validate the output** against Zod schemas whose types equal `types.ts` (checked by the
    typecheck in both directions), plus: unique EANs, every product has exactly one
    primary placement, every `categoryId` and `parentId` exists. Cross-checks run only on
    records that passed their schema. The curation files are validated the same way
    before use. These schemas are the start of `scripts/validate-data.ts` (§5).
12. **Write deterministically**: sorted keys and records, fixed formatting, so a re-run on
    the same input produces no git diff.

## 5. Department curation table

`data/curation/departments.json`, one row per K-Ruoka department id, hand-maintained:

```json
{
  "id": "91208",
  "name": "(MAITO) Maidot ja piimät - KORVAA ITSE",
  "kind": "aisle",
  "temperature": "chilled",
  "label": "Maidot ja piimät",
  "reviewed": false
}
```

- `name`: K-Ruoka's name, **refreshed from every scrape**, so the reviewer knows what the
  row is. Edits to it are overwritten
- `reviewed: false`: on rows the cleaner added. **Delete it once the row is checked**; the
  CLI refuses to write output while any row still has it
- `kind`: `aisle` | `counter` (service counters: PTISKI, Juustotiski) | `backroom` | `junk`
- `temperature`: `ambient` | `chilled` | `frozen`
- `label`: optional signage-style name for departments whose K-Ruoka name is internal

The cleaner writes a **skeleton** for any department not in the file yet, prefilled by
heuristic: `PAKASTE` → frozen; `MAITO`, `JUUSTO`, `KYLMÄ-*` and `Kylmähylly`, meat and
counters → chilled; everything else ambient and `aisle`. A few staff-note departments are
guessed as `backroom` or `junk`. Existing rows keep every decision a person made, and a
department missing from a scrape stays in the table (reported as unused). 202 rows is
about an hour's work, and it's the hand review the checklist asks for. A new department
after a re-scrape shows up here instead of slipping through.

## 6. Code layout

```
scraper/
├── normalise.ts              CLI: read and validate inputs, write data/normalised/
└── normalise/
    ├── load.ts               parse and join queue + ndjson (rule 1)
    ├── clean.ts              rules 2–7 and 10, no I/O
    ├── compare.ts            locale-independent sort order (rule 12)
    ├── categories.ts         tree, stable ids, temperature vote (rules 8–9)
    ├── departments.ts        the curation table: guesses, reconcile, lookups (§5)
    ├── records.ts            Product, Placement and departments.json records
    ├── schema.ts             Zod schemas for output and curation files (rule 11)
    ├── report.ts             report.md
    ├── fixtures.ts           shared test fixtures
    └── *.test.ts             Vitest, on small hand-written fixtures
```

- Pure functions take records and return records plus a list of `{ ean, reason }`
  exclusions. All I/O lives in `normalise.ts`.
- **Vitest, not `bun test`**, so `pnpm -r test` and CI pick it up without installing Bun.
  The CLI itself runs with Bun like the exporter: `bun run scraper/normalise.ts`, plus a
  `normalise` script in `scraper/package.json`.
- Zod is the one new dependency.

## 7. Steps

1. Done: `load.ts` + `clean.ts` with tests: join, EAN check, exclusions, text cleaning,
   shelf ID, level.
2. Done: `categories.ts` with tests: tree from paths, append-only ids, temperature vote.
3. Department skeleton generation (code done). Fill the table by hand (pair session, ~1 h).
4. `schema.ts`, `report.ts`, CLI (code done). First full run, commit `data/normalised/`.
5. Produce is scraped (§2, done). Re-run, fill the new department rows, commit again.
6. Read `report.md` by hand. Tick "Full scrape reviewed" in §13.
7. Cut 50 products across chilled, frozen and ambient from the output for `data/mock/`,
   if the contract sprint hasn't produced one yet.

Steps 1 and 2 can be done in parallel by two people. The produce scrape (§2) runs
alongside steps 1–4 and only needs to land before step 5.

## 8. Decisions this needs (record in §17 once agreed)

| Question                                         | Proposal                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Shelf ID format                                  | `<departmentId>:<shelf>`; `:00` is the department-wide shelf the map draws as one area           |
| Category source                                  | K-Ruoka's web category tree (3 levels), not store departments. It matches how people name things |
| Products with no Kupittaa location (open in §17) | **Not searchable.** They can't be routed, and they're web-shop items. Excluded with a reason     |
| Shopping bags and other `isAvailable: false`     | Excluded                                                                                         |
| Commit `data/normalised/`                        | Yes, for the team and as the `diff.ts` baseline                                                  |

## 9. Out of scope here

- Shelf matching against `graph.json` (§7 step 3): needs a graph
- `diff.ts` (§7 step 4): reads two `data/normalised/` snapshots, so it builds on this
- Search tokenising, aliases, hot/full index, tier split: `build-data.ts`
- `CategoryPlacement`: hand-maintained, but `departments.json` makes it quicker. A
  category's most common department is a good first guess for its node
