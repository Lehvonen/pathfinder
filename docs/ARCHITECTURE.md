# Store Navigation App — Software Architecture

**Project:** In-store product locator and shopping-route optimiser
**Store:** K-Citymarket Kupittaa, Turku
**Type:** School project, non-commercial, no paid service
**Team size:** 6

---

## 1. Problem Statement

Shoppers arrive with a list and walk the store inefficiently, backtracking between
departments because they do not know where individual products are shelved.

The system takes a shopping list, resolves each entry to a physical shelf location,
and produces the shortest walking route from the entrance to the checkout that
collects every item. It also supports single-item lookup ("where is this product?").

---

## 2. Scope

### In scope

- Whole store, not a pilot aisle
- Shopping-list routing (entrance → all items → checkout)
- Single-item lookup with a map pin
- Product search with Finnish-language handling
- List sharing via encoded URL, no accounts
- The list kept on the device, so a refresh does not empty it
- Purchase history on the device, opt-in, for suggestions (§11)
- Offline operation inside the store
- Mobile-first web app

### Out of scope

- Live indoor positioning
- Multiple stores
- User accounts, server-side sync, payments, commercial operation
- Sending the list or purchase history off the device
- Real-time stock levels or prices

### Key design decision: no live positioning

There is no reliable indoor positioning on a phone without BLE beacons or wifi
fingerprinting, neither of which is feasible in a store we do not own.

The route is therefore a **plan, not a tracker**. The user advances through it
manually by checking items off. The map highlights the current leg. This delivers
almost all of the practical value at a small fraction of the cost, and removes an
entire class of accuracy problems.

---

## 3. Architecture Overview

Static-first, no backend. All product and map data is generated at build time,
shipped to the client, and cached by a service worker. All routing and search runs
in the browser.

```
┌────────────────────┐
│  Scraper (`ruoka`) │   offline, run manually
│  K-Ruoka → JSON    │   see §7
└─────────┬──────────┘
          │ products.json, placements.json
          ▼
┌────────────────────┐        ┌──────────────────────┐
│   data/ bundles    │◄───────│  Map Editor (React)  │
│  core: graph, plan,│        │  internal tool       │
│  placements, index │        │  data/graph/*.json,  │
└─────────┬──────────┘        │  floorplan.svg       │
          │                   └──────────────────────┘
          │ bundled at build
          ▼
┌─────────────────────────────────────────────────────┐
│                  Web App (React PWA)                │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │  Search   │  │   List    │  │    Map View     │  │
│  │ tier scan │  │  Zustand  │  │   inline SVG    │  │
│  └─────┬─────┘  └─────┬─────┘  └────────┬────────┘  │
│        │              │                 │           │
│        └──────────────┼─────────────────┘           │
│                       ▼                             │
│         ┌───────────────────────────┐               │
│         │  packages/core            │               │
│         │  Dijkstra · TSP · types   │               │
│         └───────────────────────────┘               │
│                                                     │
│  Service worker: precaches shell + core tier        │
│  IndexedDB: display tier, lazy, stale-while-reval.  │
└─────────────────────────────────────────────────────┘
```

**Why no backend:** the product catalogue is read-only, and the part of it that routing
needs is small enough to ship to the client. That "part of it" is load-bearing, and it
is what the tiering and the data budget in §14 exist to guarantee. Removing the server removes deployment complexity, latency, and the
need for search infrastructure, and it makes offline support nearly free. Cellular
coverage inside large stores is unreliable, so offline is a requirement rather than
a nicety.

**Decision: no backend, including for sharing.** The only features that would justify
one are shared household lists and cross-device sync. Both drag in accounts, auth,
sync conflicts and a deploy dependency, none of which the course is assessing, and
all of which weaken the offline story.

Sharing is instead handled by **encoding the list state into the URL**. A shareable
link gets most of the value with no server, no accounts and no new failure modes,
and it demos well: send a link from one phone to another on stage.

Revisit only after submission, if the app is actually being used.

---

## 4. Technology Stack

| Layer              | Choice                                                                                                               | Rationale                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Frontend framework | React + TypeScript                                                                                                   | Team knows React; types catch graph/route errors early               |
| Build tool         | Vite                                                                                                                 | Fast dev server, simple PWA plugin                                   |
| Styling            | Tailwind CSS                                                                                                         | Fast iteration, no CSS architecture debate                           |
| Map rendering      | Hand-written inline SVG                                                                                              | Own coordinate system, not geographic tiles                          |
| Pan / zoom         | `d3-zoom` (only this module)                                                                                         | Pinch-zoom without pulling in all of D3                              |
| Pathfinding        | Own Dijkstra (or `ngraph.path`)                                                                                      | Small, and it is the interesting part of the report                  |
| TSP                | Own implementation                                                                                                   | Held-Karp + 2-opt, written in-house                                  |
| Search             | `packages/search`: own scan over three pre-sorted tiers; FlexSearch only if the phone bench needs it (§10)           | Works offline; no index to build at startup; fits the core budget    |
| State              | Zustand                                                                                                              | Lighter than Redux, avoids prop-drilling to the map                  |
| Persistence        | `localStorage` (lists) + IndexedDB (display records)                                                                 | Lists are tiny; full product records should not sit in JS heap       |
| PWA                | `vite-plugin-pwa`                                                                                                    | Manifest + service worker with minimal config                        |
| Scraper            | `scraper/export-kupittaa.ts` (Bun + Playwright), reusing the `p18a/mcp-k-ruoka` browser session from a sibling clone | Returns store-specific name, price, popularity and in-store location |
| Hosting            | Netlify, free tier                                                                                                   | Static deploy, HTTPS included (required for PWA)                     |

**Deliberately not used:**

- _Leaflet / Mapbox_ — built for geographic tiles; we have one floorplan in a local
  coordinate system, and plain SVG gives us React events and CSS animation for free.
- _Postgres full-text search_ — would require a server and would break offline search.
- _Redux_ — unnecessary ceremony at this scale.

---

## 5. Repository Structure

```
/
├── .github/
│   ├── workflows/           CI pipelines
│   └── pull_request_template.md
│
├── .claude/
│   ├── rules.md             architectural invariants agents must not violate
│   ├── agents/              committed subagent definitions
│   └── skills/              committed skill definitions
│
├── docs/
│   ├── ARCHITECTURE.md      this document
│   └── plans/               implementation plans, one per feature, written before code
│
├── scripts/
│   ├── validate-data.ts     Zod schemas + graph integrity checks (planned; the schemas so far are in scraper/normalise/schema.ts)
│   ├── build-data.ts        data/normalised/ + data/graph/ → data/build/, stamps version (planned)
│   ├── build-search.ts      the search half of it: tiers, category data, aliases → data/build/core/
│   ├── build-routing.ts     the routing half: graph, placements, category placements, areas → data/build/core/
│   └── seed-synthetic.ts    deterministic 50k-product / 400-node fixture (planned)
│
├── .env.example             committed; VITE_DATA_SOURCE etc.
│
├── scraper/                 Bun + TypeScript workspace package; the `ruoka` session it uses lives outside, see §7
│   ├── export-kupittaa.ts   whole-store export: products + in-store location → cache/
│   ├── kupittaa-format.ts   pure helpers for the export, tested
│   ├── normalise.ts         scrape → schema: the data cleaner CLI, see docs/plans/normalise.md
│   ├── normalise/           its rules, category tree, department table, validation, report; also validates the map files
│   ├── diff.ts              compare scrapes, report moved/removed products (planned)
│   ├── README.md            how to run the export
│   ├── package.json, tsconfig.json
│   └── cache/               trimmed records, gitignored
│
├── data/
│   ├── graph/               SOURCE: the store map and walk graph, see docs/plans/map.md
│   │   ├── areas.json       labelled areas and entrances, traced from the store's own map
│   │   ├── department-level.json  rough walk graph, one access node per area; not a source of truth
│   │   └── …                later: one file per section from the map editor, plus connections.json
│   │                        for edges that cross between sections
│   ├── curation/            SOURCE: hand-maintained input (department table, department → area, overrides)
│   ├── normalised/          generated by `scraper/normalise.ts`, committed; the diff.ts baseline
│   ├── mock/                hand-made fixtures, committed, used from day 1
│   ├── e2e-fixture/         frozen bundle, E2E runs against this only
│   ├── synthetic/           generated, realistic scale, for perf + property tests
│   └── build/               generated bundles, committed
│       ├── manifest.json    version + content hashes + tier sizes, never cached
│       ├── core/            precached, required offline — budgeted, see §14
│       │   ├── graph.json                the walk graph, without its source note
│       │   ├── areas.json                the map's areas and entrances, for stop names and the map view
│       │   ├── floorplan.svg             (planned)
│       │   ├── categories.json
│       │   ├── placements-primary.json   EAN → { nodeId, categoryId }
│       │   ├── category-placements.json  categoryId → nodeId, resolves generic entries; generated for now
│       │   ├── category-top.json         categoryId → [ean, …], top 10 SKUs of each subtree by popularity
│       │   ├── category-rank.json        categoryId → rank of its best product, orders category results
│       │   ├── aliases.json
│       │   ├── search-tier-1.json        most popular food, { eans, names, categoryIds }, pre-sorted (§10)
│       │   ├── search-tier-2.json        remaining popular food, then popular non-clothing
│       │   └── search-tier-3.json        everything else
│       └── display/         lazy-loaded, unbudgeted
│           ├── products.json             full records, keyed on EAN
│           └── placements-secondary.json end-caps, promo spots
│
├── packages/
│   ├── core/                shared, framework-free, unit-tested
│   │   └── src/
│   │       ├── types.ts     the data contract — see docs/plans/contract.md (written in the contract sprint)
│   │       ├── geometry.ts  pure geometry: lengths, bounds, fit-to-view
│   │       ├── dijkstra.ts
│   │       ├── tsp.ts
│   │       └── route.ts     orchestration: list → Route
│   ├── search/              product search, framework-free, unit-tested, see docs/plans/search.md
│   │   └── src/             runtime (normalise, query, scan, engine); build/ is a separate export
│   └── map-render/          React SVG components shared by both apps (planned)
│
└── apps/
    ├── web/                 the shopping app
    └── map-editor/          internal tool, local-only, never deployed
```

Putting the algorithms in `packages/core` means both apps share the same code and
gives a clean place for unit tests, which is worth marks in the report.

### `.claude/` — AI tooling, committed

Agent configuration lives in the repository, not in six people's local setups.
Committed, reviewed and versioned like any other code.

- **`rules.md`** — the architectural invariants an agent must not violate: EAN is the
  key, the core tier is budgeted, generic entries resolve through `CategoryPlacement`
  before routing, no backend, agents propose and humans commit. Short, and updated when
  a decision in §17 changes.
- **`agents/`** — subagent definitions. Reviewing, not writing: agents report findings
  and humans make the edits and the commits.
- **`skills/`** — skill definitions for the repeatable procedures in this document, such
  as running `data:build` and interpreting the budget report.

Set up in week 1 and grown as the project reveals what is actually worth automating.
The point is that six people get the same behaviour from the same tools.

### `docs/` — this document and what follows it

This architecture document lives in `docs/ARCHITECTURE.md` and is the reference for
what the system is meant to be.

`docs/plans/` holds implementation plans written by developers as they work: one
markdown file per feature or work package, written before the code and committed
alongside it. They record how a piece was approached and why, at a level this document
deliberately does not descend to. Cheap to write, and they are what the report gets
drafted from at the end instead of reconstructing eight weeks of decisions from memory.

---

## 6. Data Model

### Core types

The source of truth is `packages/core/src/types.ts`; the reasoning is in
`docs/plans/contract.md`, to be written in the contract sprint (§12). The types are not
repeated here. The key decisions are
summarised in §17, but where the two differ, `types.ts` is authoritative.

---

### Notes

- **Key on EAN/GTIN.** Product names change constantly; barcodes do not.
- **Only fields the app reads are kept.** Price, images, descriptions and marketing
  copy are discarded during normalisation. Prices and stock levels are out of scope
  (§2), and the catalogue is precached onto phones, so every unused field is dead
  weight shipped to every user. See the data budget in §14.
- **Popularity is a build-time signal, not a shipped field.** Kesko's `popularity`
  score orders the search tiers and decides which tier a product is in (§10). It is not stored on `Product`, so `types.ts` does not change. A score of 0
  means _unranked_ (about 15k of ~43k products at Kupittaa), not a tie, and is
  normalised to `null`.
- **Placements are one-to-many, with exactly one primary.** A product can appear in
  its home aisle, on a promotional end-cap, and in a cooler near the checkout. Exactly
  one of those is `isPrimary`; that is the one routing uses.
- **A placement names a shelf, not a node.** The access node comes from the shelf's
  `accessNodeId` in the graph, derived at build time, so the two cannot disagree.
- **A shelf ID is `<departmentId>:<shelf>`**, e.g. `91208:05`. Shelf numbers repeat in
  every department, so the number printed on the shelf is only the part after the
  colon. The K-Ruoka department id is used rather than the name, because names carry
  notes such as "KORVAA ITSE" that change. Shelf `00` means the store records only the
  department (48% of products at Kupittaa); `<departmentId>:00` is the
  **department-wide shelf**, drawn as one polygon over the department area, so those
  products route to the department without a change to `types.ts`.
- **`temperature` on category** drives the frozen-last routing constraint.
- **Both entry kinds are supported; generic is the default.** People write "maito",
  not a specific SKU, and which carton gets picked is decided at the shelf. Forcing
  SKU selection would move twenty decisions from the store to the sofa and make the
  app slower than a paper list. SKU-level entries still exist, for single-item
  lookup and for cases where the exact product matters. Search surfaces category
  matches above product matches for generic queries.

- **Generic entries resolve to a single node before routing.** A generic entry is in
  principle satisfiable at several nodes, since milk sits both in the dairy aisle and
  in the cooler by the checkout. Letting the router choose turns the problem into a
  _generalised_ TSP, where each stop is a set of candidate nodes rather than a single
  node, which is meaningfully harder.

  The MVP therefore resolves each generic entry through `CategoryPlacement`
  (`categoryId → nodeId`, hand-maintained; generated for now, §7) before the route is computed. That is the
  only resolution path for generic entries. The generalised version is documented as
  future work in the report — an identified limitation, not an unnoticed one.

---

## 7. Data Pipeline

1. The `ruoka` scraper (below) pulls products with their in-store location, rate-limited,
   and caches them in `scraper/cache/` as **trimmed records**: the fields the pipeline
   uses, plus price for people reading the CSV. Raw responses are not kept (§17).
   Development never re-hits the site for data already cached; a field that is not cached
   means re-running the listing (~25 min) or, for location fields, the location phase
   (~18 h).
   The whole-store export is `scraper/export-kupittaa.ts`, which reuses the `ruoka`
   browser session: it lists every product by category, then fetches each one's location
   from `/kr-api/v4/products/<slug>?storeId=N119`, one request every 1.5 s, resumable,
   stopping on any block. Output in `scraper/cache/kupittaa/`: `queue.json` (every
   product with name, price and popularity, from the listing), `products.ndjson` (one
   record per product with its location), `category-names.json` (category path → Finnish
   name, from the listing) and `kupittaa.csv` (both merged, for people).
2. `normalise.ts` parses `queue.json` and `products.ndjson` into `products`,
   `placements`, `categories`, deduplicating on EAN. It also writes `departments.json`
   (the reviewed department table with shelves and counts, for the map work),
   `popularity.json`, the append-only `category-ids.json` and a `report.md` for the hand
   review, into `data/normalised/`. Every input is validated first; nothing is written
   while a department is unreviewed or the output fails validation
   (`docs/plans/normalise.md`).
3. Shelf IDs are matched against the shelves in `graph.json`, and each placement's
   access node is taken from the matched shelf. A shelf ID the graph does not list
   **falls back to its department-wide shelf `<department>:00`**, and the build reports
   how many did; while the graph is department-level (§8) every shelf does. **A shelf
   with no match even then is logged as an error, not silently dropped** — that list is
   the handoff between the data work and the map work. Done by `build-routing.ts`
   (`pnpm data:routing`), which also writes `graph.json`, `areas.json` and
   `category-placements.json`: all 39,479 products placed, 20,526 through the fallback,
   none unmatched (2026-10-04 scrape). Until `CategoryPlacement` is hand-maintained, each
   category is **generated**: the node holding most products of the category and its
   subcategories, a rough draft.
4. `diff.ts` compares against the previous scrape and reports what moved, appeared,
   or disappeared. Stores rearrange; this is how you notice.
5. `build-search.ts` (`pnpm data:search`, the search half of `build-data.ts`) **splits
   the catalogue into three search tiers** (§10), each stored in rank order so the app
   needs no index: `search-tier-{1,2,3}.json`, columnar `{ eans, names, categoryIds }`,
   so a result can be rendered without the display tier. It also writes
   **`category-top.json`** (`categoryId → [ean, …]`, the top 10 products of each
   category subtree by popularity), so generic matches can list popular SKUs without
   popularity being shipped (§6), and `category-rank.json`, which orders category
   results. Every input and the output are validated first; nothing is written if a
   check fails or the search files exceed 1 MB gzipped. Plan: `docs/plans/search.md`.
6. Output is **split into core and display tiers** (§14) and written to `data/build/`,
   committed, so the app build is reproducible. `manifest.json` records the gzipped
   size of each chunk.

**Scraping etiquette:** rate-limit, cache aggressively, scrape once into a bundle
rather than hitting K-Ruoka live per user request. The project is non-commercial and
unaffiliated, so avoid K-Citymarket branding in the UI.

**Scrape schedule:** one full scrape, plus one manual re-scrape before the demo,
diffed against the committed bundle with `diff.ts` so moved, new and removed products
are caught before going on stage. No scheduled scraping (§14b).

### The scraper: `ruoka` MCP server

[`p18a/mcp-k-ruoka`](https://github.com/p18a/mcp-k-ruoka) is an unofficial MCP server,
used here with a local patch that adds in-store locations. It has two roles:

- **Ad-hoc lookups.** Registered in Claude Code as the MCP server `ruoka`, so product
  data can be pulled from a chat ("where is maito in Kupittaa?").
- **The browser session.** Its Playwright session is what `scraper/export-kupittaa.ts`
  loads at runtime. **The export script, not the MCP server, does the whole-store run**
  (step 1 above); see `scraper/README.md` for its commands.

**What it returns.** Per product, at the selected store (`popularity` and
`popularity_rank` come from the export script only):

| Field                      | Example (K-Citymarket Kupittaa)                                                                                                                             | Source                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `id`                       | `6410405082657` (EAN)                                                                                                                                       | search API                          |
| `name`                     | `Pirkka suomalainen kevytmaito 1l`                                                                                                                          | search API                          |
| `price`                    | `0.89`, plus `unitPrice` `0,89 €/l`                                                                                                                         | search API, store-specific          |
| `brand`                    | `Pirkka`                                                                                                                                                    | search API                          |
| `category`                 | `Maito, juusto, munat ja rasvat`                                                                                                                            | search API                          |
| `location.department`      | `(MAITO) Maidot ja piimät - KORVAA ITSE`                                                                                                                    | product page, store-specific        |
| `location.departmentOrder` | `68`                                                                                                                                                        | product page, store-specific        |
| `location.shelf`           | `05` (K-Ruoka calls it `module`; the site shows "Hylly")                                                                                                    | product page, store-specific        |
| `location.level`           | `1` (shelf level, "Taso")                                                                                                                                   | product page, store-specific        |
| `location.zone`            | `KERÄILY`                                                                                                                                                   | product page, store-specific        |
| `popularity`               | `22234,8`; `0,0` means unranked                                                                                                                             | category listing                    |
| `popularity_rank`          | `1` = most popular; unranked products all share the last rank (28024 in the first scrape; it changes with catalogue size, so test `popularity` = 0 instead) | computed by the export script's CSV |

`get_stores` lists store IDs, optionally filtered by city.

**Where the location comes from.** The search API and the category listing have no
shelf data; each product's detail data carries `product.location` for the selected
store. The two tools read it differently:

- **The export script** calls the JSON endpoint `/kr-api/v4/products/<slug>?storeId=N119`,
  about 12 KB per product, one at a time with a 1.5 s pause.
- **The MCP patch** reads it from the product page,
  `/kauppa/tuote/<urlSlug>?kauppa=<store slug>`: one page load (~1.8 MB) per result,
  five in parallel. Fine for a handful of ad-hoc lookups, too heavy for a whole store.

Shelf numbers are per store (the same milk is shelf 31 in Iso Omena and 05 in
Kupittaa), so the store must always be passed. `departmentOrder` looks like the store's
own walking order, which is worth testing as a routing hint. Some departments are marked
`isPublic: false`, so their names are internal labels rather than signage text.

**MCP defaults.** The server is registered with `DEFAULT_CHAIN=k-ruoka` and
`DEFAULT_STORE_ID=N119` (K-Citymarket Turku Kupittaa), so a search needs only a query.
`includeLocation` defaults to `true`; set it to `false` for faster searches without
locations.

**Why `mcp-k-ruoka` lives outside the repo.** The upstream repository has no licence, so
its code is not copied into this public repo; the export script loads its session from
a sibling clone at runtime. What lives here is our own code: `scraper/export-kupittaa.ts`
and its output under `scraper/cache/` (gitignored).

**Setup for the export script** (once per machine, Windows paths shown). No patch and
no MCP registration needed:

```
npm i -g bun
git clone https://github.com/p18a/mcp-k-ruoka.git C:/dev/mcp-k-ruoka
cd C:/dev/mcp-k-ruoka && bun install && bunx playwright install chromium
```

**Optional, for ad-hoc lookups from Claude Code:**

```
# apply the location patch: src/browser/k-ruoka.ts, src/tools/search.ts, src/types.ts
claude mcp add --scope user ruoka -e DEFAULT_CHAIN=k-ruoka -e DEFAULT_STORE_ID=N119 -- bun run C:/dev/mcp-k-ruoka/src/index.ts --stdio
claude mcp get ruoka    # should show ✔ Connected
```

Restart Claude Code after adding it. The patch currently exists only as uncommitted
changes in one local clone; it needs a home (a fork, or a patch file under `scraper/`)
before anyone else can use the MCP lookups. The export does not depend on it.

**Caveats.**

- **Unofficial.** It reads K-Ruoka's internal API and page data, so a site change can
  break it. A broken location lookup returns `location: null` rather than failing the
  search, so check for nulls after every run.
- **Bot-protection bypass.** It gets past Cloudflare with a Playwright stealth plugin.
  Make sure that fits what Kesko has agreed to before any large run, and keep to the
  etiquette above either way.

---

## 8. The Map

The floorplan is the most labour-intensive part of the project and sits on the
critical path.

### Representation

- **Shelf polygons** — SVG paths in a local coordinate system with a known scale
- **Walk graph** — nodes at aisle ends, junctions, entrance, checkouts, plus one
  access point per shelf section; edges weighted by real distance
- **Access, checkout and entrance nodes are dead ends**: a route may start or end a leg at
  one but never pass through it. A block open on several sides has one access node at its
  centre, linked to the aisle on each side, so passing through would cut through the
  shelves; entrances and checkouts are where a route begins and ends

### Current state — a department-level draft

The first map is traced from **K-Citymarket's own store map** of Kupittaa (the QR code in
the store links to it). The map itself is not committed, since it is theirs and the repo
is public; only our traced outlines are. Three files, all validated by tests over the
committed data:

- `data/graph/areas.json` — the map's 52 labelled areas and the 2 entrances, in metres
  at a **placeholder scale** (the map gives none)
- `data/curation/department-areas.json` — which area each of the 198 departments with
  products is in; rows placed by judgement carry `reviewed: false` until checked in the
  store
- `data/graph/department-level.json` — a **rough walk graph, not a source of truth**:
  aisles along the gaps between blocks, one access node per area linked to every open
  side, one `<department>:00` shelf per department

Together they make every product routable now. They are replaced section by section once
the map editor exists. What is a guess, and what to check on the store visit:
`docs/plans/map.md`.

### Fidelity — schematic, decided

Route correctness depends on **topology and relative distances**, not absolute
geometry. Whether aisle 7 connects to the back walkway matters enormously. Whether
it is 31.4 m or 33 m long changes nothing about the stop order. A visually
approximate map with correct connectivity produces the same routes as a surveyed one.

Go schematic and do not revisit it. Time saved here goes into the walk graph instead.

The one place to spend extra care is connectivity **around department boundaries and
the checkout area**, since a missing edge there causes a visibly stupid detour.

### Edge weights — geometric placeholder, pace counts override

Until an edge has been walked, its weight defaults to the straight-line distance
between its two nodes in the schematic coordinates. That is good enough to route
against, but on a schematic map it is only an approximation.

Do not measure the store. During the verification walk, count steps per aisle segment
and multiply by stride length. A paced weight **replaces** the geometric default for
that edge. That yields weights accurate to roughly 10%, which is more than enough for
route optimisation and good enough to display "about 640 m, 12 minutes" without
embarrassment.

### Map Editor

An internal Vite app: click to place nodes, drag to connect edges, assign shelf IDs,
export JSON. It shares SVG primitives with the main app.

This tool decides whether mapping the store takes a weekend or three weeks. Ship a
rough, ugly version early rather than a polished one late.

**The editor has no offline requirement.** It is used at a desk by one person. No
service worker, no precaching, no data budget. Stated here so nobody spends a day
adding PWA support to an internal tool.

### Verification

One physical walkthrough of the store, confirming that scraped shelf numbers match
the shelf labels on the floor. The draft map adds its own list to check: the
`reviewed: false` department rows, the entrances, and the gaps the map does not show
(`docs/plans/map.md` §6).

---

## 9. Routing Engine

The problem is an **open Travelling Salesman Problem** (start at an entrance, end at a
checkout) layered on top of shortest-path search. The store has two entrances and three
checkouts: every entrance that reaches all the stops is tried, and the checkout is chosen
with the order, as the one nearest the last stop. Built in `packages/core`
(`dijkstra.ts`, `tsp.ts`, `route.ts`); details in `docs/plans/routing.md`.

**Pipeline:**

1. Resolve each list item to a target node: products through their primary placement,
   generic items through `CategoryPlacement`.
2. Run Dijkstra to build an all-pairs distance matrix over only the nodes this list
   touches.
3. Solve the TSP over that matrix:
   - **≤ 15 stops** — Held-Karp, exact optimum, runs instantly
   - **> 15 stops** — nearest-neighbour + 2-opt: measured at 15 stops on the map, 4 %
     longer than the optimum on average, 12 % for one list in ten, up to about 30 %
4. Apply the **frozen/chilled-last soft constraint** — a penalty for visiting
   temperature-controlled stops early. Real shoppers care about this, and it
   differentiates the result from a pure distance optimiser.
5. Expand the stop order back into one leg per stop (the path from the previous point),
   plus a final leg from the last stop to the checkout.

### Serpentine baseline — build it, but TSP is the default

A serpentine heuristic (visit aisles in physical order, alternating direction) is
roughly thirty lines and is often near-optimal in supermarkets. Implement it, but
**ship the TSP as the default**.

Two reasons:

- The TSP is the algorithmic substance of the project, and the course will want to
  see it.
- Having a baseline converts "we implemented Held-Karp" into "our routes were N%
  shorter than aisle-order across 20 test lists". That is a result rather than a
  claim, and it is the strongest number available for the report.

Keep serpentine reachable behind a toggle. Optimal routes occasionally look strange
to a human, zig-zagging between aisle entrances in a way that is shorter but feels
wrong, and the simple mode is a useful escape hatch during the store test.

**Testing:** hand-built lists on the mock graph with manually verified expected
routes. Pure functions, no UI, testable from day one.

---

## 10. Search

Finnish is the hard part. `maito` must match `Kevytmaito 1l`, `maitoa`, and
`luomumaito`. Compounding and inflection defeat naive word matching. The detailed
design and the measurements behind it are in `docs/plans/search.md`.

- **Infix matching.** A query word of 3+ letters matches anywhere in a name, because
  the product is usually the last part of a compound (`ruisleipä` is bread). Words of
  1–2 letters match word starts only, or `m` would match almost everything.
- **Normalisation** folds case and accents on both sides, so `creme` finds `crème`, but
  **å, ä and ö are letters of their own**: `nakki` (sausage) never finds `näkkileipä`
  (crispbread).
- **Alias table** (`aliases.json`), hand-maintained, covering colloquialisms, brand
  shorthand, inflected forms and plural category names (`leipä` → "Leivät"). Aliases
  widen what matches and never drop the typed word; they do not boost. A term written
  `=word` matches the whole word only (`=maidot`: milk, not "maidottomat", dairy-free);
  `-text` leaves out products and categories containing that text (`kana` without eggs:
  `-muna`).
- **Ranking by popularity only.** Kesko's popularity score (§6) is the ranking, so
  `ma` puts the most-bought milk first. Unranked products sort after ranked ones. No
  boosts: a boost would break the pre-sorted order the scan depends on.
- **Category results** — a query that matches a category name shows the category above
  the products, at most three, most specific first ("Maidot", not all of dairy).
  Each offers **add as a generic entry** (resolved through `CategoryPlacement`, §6) and
  **browse**: a page of that category's products with its own search bar. Category
  names never change how products rank. Store department names are never searched.
- **Typo tolerance** — one edit on words of 5+ letters, only when the exact search finds
  almost nothing.

Client-side search keeps everything working offline.

### Speed first

**The goal is that nobody waits to find milk.**

- **Three tiers, searched in order** (§17). Tier 1 holds the most popular food, an
  equal share per food category (~8,000 products); tier 2 the remaining popular food,
  topped up with popular non-clothing products (~10,000); tier 3 everything else. Tier 1
  is loaded first and is searchable almost at once; tiers 2 and 3 load straight after,
  in small pieces so typing never freezes. Their results are appended below what is
  shown, so the list never reshuffles. All three are precached, so there is no "not
  downloaded yet" state.
- **No index; a scan that stops early.** Each tier is stored in rank order, so the
  first 20 matches are the top 20 results and the scan stops there. A query reads each
  tier at most once per word. Measured at ~2 ms for a full pass over all 39k names on a
  PC, with no index to build or ship. FlexSearch or a trigram index comes back only
  if the phone bench misses the §14 targets.
- **No debounce, small renders.** Search runs on every keystroke and renders 20 results
  at a time, with "show more".
- **Popularity decides load order, not what is cached.** Every product stays searchable
  offline.

---

## 11. Frontend

### List builder

Add, remove, reorder, check off. Saved and recurring lists in `localStorage`.
**Share via link:** list state encoded into the URL, decoded on load. No accounts.

**Current state — a rough first version** (`apps/web/src/list/`). The list is a panel
fixed to the bottom of the search screen and its category pages; the route screens replace
it. Its heading, "Ostoslista (n)", opens and closes it; it starts closed, so the results get the screen, and
open it scrolls within half the screen. Items can be added, removed, and given an amount
from 1 to 99 with a − / + stepper; adding something already on the list raises its amount
instead of adding a second row. A "Laske reitti" button shows whether the list is open or
closed, disabled while it is empty, and opens the route overview ("Route overview" below).
The state is a `useReducer` in `useSavedList` (`apps/web/src/list/`), which `App.tsx` calls, saved on the device (below). Items are ticked on the shopping screen (`setChecked`; any rise in amount unticks); the
panel and "Muokkaa listaa" show a ticked item struck through, with "✓ Kerätty" to untick it,
since a ticked item is left out of the next route. Reorder and Zustand are still to come;
Zustand when the map needs the list too.

**The list survives a refresh** (`useSavedList`, `listStorage.ts`,
`docs/plans/device-storage.md` §2). The list, ticks included, is saved to `localStorage`
(`pathfinder.list.v1`) after every change and loaded as the reducer's starting state, so
the first render already shows it. After a refresh the app opens on
search with the list; a shop under way is not resumed, but ticked items stay out of the next
route, so the shopper carries on where they were. **If the list was not saved for 12
hours, its ticks are cleared** on load; it is saved on every change and every start, so that
is 12 hours with the app unused. A shop closed without "Valmis" then does not hide items from
the next one, unless the tab stays open in between (`docs/plans/device-storage.md` §8). Saved rows
are checked on read, rebuilt from their known fields, bad ones dropped and duplicates merged;
if storage is unavailable the list stays in memory only. No consent is asked:
keeping the shopper's own list is strictly necessary.

### History and suggestions — planned

`apps/web/src/history/`, `docs/plans/device-storage.md` §3–5. **Only on the device, only
with consent.** The finish card asks whether to remember purchases ("Kyllä" / "Ei kiitos")
until the shopper answers; it is off until they say yes, and a trip finished without an
answer is not recorded. With consent, "Valmis" records the ticked items and the day, nothing
else, keeping the newest 50 trips and at most a year. On search, with the search box empty,
**"Usein ostamasi"** suggests up to 8 things picked on at least 2 trips, recent trips
counting more, each with "Lisää". **Withdrawing is always one tap away:** while history is
on, the same place shows "Ostohistoria on päällä" with "Unohda ostohistoria" (deletes the
history) and "Älä muista" (deletes it and withdraws consent), even with no suggestions to
show. Nothing is sent anywhere (§2).

### Route mode

Default optimised (TSP). Toggle for aisle-order (serpentine), used as the report
baseline and as a fallback when an optimal route looks unintuitive in the store.

### Map view

Inline SVG in three layers: shelf polygons, route legs, markers.

- **Numbered pins** on target shelves, matching the numbered list below the map
- **Three path states** — completed legs greyed, current leg highlighted and
  animated, upcoming legs faint. _Changed for the prototype: walked legs are the same deep
  green as the current one, and upcoming legs a light green (`docs/plans/route-map.md` §2)._
- **Animated current leg** via `stroke-dasharray` + a CSS animation on
  `stroke-dashoffset`; roughly four lines of CSS, disproportionate perceived polish
- **Auto-zoom to the current leg** on mobile, with a full-route toggle. A whole-store
  view on a phone screen is unreadable.
- **Check-off advances the map** — one interaction marks the item collected and moves
  to the next leg

### Trip summary

Stop count, estimated distance, estimated time.

### Route overview — current state, a rough first version

`apps/web/src/route/`, `apps/web/src/map/`. The routing data (about 230 KB gzipped) loads in
the background once search is ready, so it never slows the first search (§14). "Laske
reitti" plans the route from every entrance for the list as it is then, and shows the
**route overview** in place of search: the trip summary ("12 pysähdystä · 322 m · noin 9
min"), **the whole route on the store map** (grey areas, no other lines, the route in green
with numbered nodes), "Aloita: Sisäänkäynti 1", then **"Muokkaa listaa"** (amounts, remove,
"+ Lisää tuotteita") and **"Vaihda aloituspaikka"**, instant since both entrances are
planned. **Entrance 1 is the default.** The list panel only shows on search. Data still
loading, data that failed to load (with "Yritä uudelleen") and a map error each show a
message instead. **"Aloita ostokset"** opens the **shopping screen**: the map in about 70 %
zoomed to the leg to the next stop, and a sheet with that stop's items, each with a tick;
once all are ticked the route moves on (unticking steps back), and the sheet opens to the
whole list. After the last stop, "Lopeta ostokset" shows the finish: the route drawn in,
the trip in numbers, green confetti, and "Valmis" back to search with an empty list.
Every store map can be pinched, panned and wheel-zoomed, with no React render during the
gesture, and glides to the next leg; the sheet can be dragged by its heading. Plan:
`docs/plans/route-map.md`.

### Offline

Manifest, service worker, precached app shell and **core tier only** (§14), which
includes all three search tiers. Chunks are content-hashed individually so one can be
updated without redownloading everything. On start tier 1 is loaded first and tiers 2
and 3 straight after (§10).

The display tier is fetched lazily, stale-while-revalidate, and cached in IndexedDB
keyed on EAN. Search, list building, routing and the map therefore work with no
network at all.

**Degraded state, when core is present and display is not:** results and list entries
render with the name from the search tiers and without brand or secondary-placement
information. Nothing is blocked and no route is affected. This is the only offline
degradation in the app and it should be shown as a quiet inline note, not an error.

---

## 12. How the Team Works

There are no roles. Everyone is expected to touch every part of the system at least
once. On an eight-week project this is also the point: six people who each understand
one sixth of the system cannot write the report, cannot cover for each other, and
cannot review each other's pull requests meaningfully.

Work is owned **per task, not per area**.

### Contract sprint — everyone, first 3 days

- Agree the TypeScript types in `packages/core`
- Write fixtures satisfying them: ~50 products, a 15-node toy graph, a hand-drawn
  6-aisle floorplan
- Commit as `data/mock/`
- Everyone builds against mocks until real data replaces them

### The board

Every checkbox in §13 is a card. The rules are short enough to remember:

- **One name on a card while it is in progress.** No fixed lanes, but nothing is in
  flight without somebody answerable for it. Unowned work is unfinished work.
- **Two cards in progress per person, maximum.** Holding four means finishing none.
- **Claim from what is unblocked.** Each card lists what it is ready-when; anything
  whose dependencies are met is fair game regardless of who did the adjacent work.
- **A card nobody has claimed for a week gets raised at standup**, not left to rot.
  This is almost always the tedious work, and the tedious work is on the critical path.
- **Tedious bulk work is done in sessions, not by a person.** Tracing shelf polygons
  and placing nodes is several hundred repetitive actions; book two people for two
  hours in a room and split the store by section. See `data/graph/` in §5.
- **Recurring work is a card like any other.** The Friday store run is claimed each
  week by whoever takes the card. Deploys happen automatically on merge to `main`.

CI, `packages/core` and the data build have no permanent owner; the person who
touches them next owns them for that change.

### Review

- **One required review, from someone who did not write the change.** Enforced by
  the "required approving reviews" setting in GitHub branch protection, not by a person.
- There are **two exceptions**:
  - **Changes to shared types in `packages/core` need two reviewers**, because they
    ripple into everyone's work in progress.
  - **`.claude/rules.md` changes are merged only alongside a decision recorded in §17.**

### Cadence

- Two 15-minute standups per week: what is claimed, what is blocked, what is unclaimed
- **Friday store run** — see §13
- Pairing encouraged across tracks, specifically so nobody becomes the only person who
  understands the router or the graph format

---

## 13. Work Checklist

Organised by track rather than by person. Anything whose dependencies are met is
claimable by anyone.

**The standing invariant:** the deployed app routes a real list in the real store every
Friday from week two onward. If it does not, that is the only thing anyone works on
Monday. This outranks every checkbox below.

### Track A — Setup and infrastructure

- [ ] Scope agreed in writing; course deliverables and deadline identified, plan worked backwards from it
- [ ] Repo created **public**, pnpm workspaces configured, branch conventions set
- [x] `.env.example` committed with `VITE_DATA_SOURCE=mock | synthetic | build`
- [x] Pre-commit hooks (Husky + lint-staged)
- [ ] CI skeleton: lint, typecheck, unit tests, build, branch protection, one required review
- [x] `.claude/` in place: `rules.md`, `agents/`, `skills/`, committed
- [x] `docs/` in place, this document at `docs/ARCHITECTURE.md`, `docs/plans/` created
- [ ] Contract sprint completed, `data/mock/` committed, `docs/plans/contract.md` written
- [ ] `pnpm seed:synthetic` — deterministic 50k-product / 400-node fixture _(ready when: types are agreed)_
- [ ] CI data-validation job: Zod schemas, duplicate EANs, referential integrity, graph connectivity, edge sanity _(ready when: `data/mock/` exists)_
- [ ] CI core-tier budget gate, **failing** rather than warning _(ready when: `data:build` produces a manifest)_
- [ ] Path filters, concurrency + cancel-in-progress, pnpm and Playwright caches
- [ ] Netlify deploy on merge to `main` — **needed for the first Friday store run, not later**

### Track B — Product data

- [ ] **Reconnaissance visit, week 1.** Check twenty scraped shelf IDs against physical shelf labels. The entire design assumes these match; find out before three weeks are spent on it
- [x] `ruoka` scraper working: name, price and in-store location (department, shelf, level) per product at Kupittaa, see §7
- [ ] `ruoka` location patch given a home (fork or patch file) so the whole team can use MCP lookups — optional, the export does not need it
- [x] Whole-store export (`scraper/export-kupittaa.ts`) written, output in `scraper/cache/kupittaa/` — first full run done 2026-10-03 (43,633 listed, 39,479 kept after cleaning)
- [x] `normalise.ts` — raw → schema, EAN dedup, multi-placement handled, **no price, images or descriptions** _(the scrape gives one location per EAN, so every product has one primary placement for now; the types allow more)_
- [ ] Full scrape reviewed by hand for junk, duplicates, missing shelves
- [x] Shelf IDs matched against `graph.json`, falling back to the department-wide `<department>:00` shelf; the fallback count reported, a shelf with no match even then logged as an error, never dropped _(`pnpm data:routing`: 39,479 placed, 20,526 through the fallback, none unmatched)_
- [ ] `diff.ts` — compare scrapes, report moved / new / removed
- [ ] `pnpm data:build` — versioned bundles, manifest, **core/display tier split**; calls the search build (`pnpm data:search`, done: three search tiers, `category-top.json`, `category-rank.json`, aliases) and the routing build (`pnpm data:routing`, done: graph, placements, category placements, areas)
- [ ] **Size measurement on real data**: run `data:build` over the partial real scrape as soon as one exists, record gzipped size per chunk and extrapolate to the full catalogue; use the synthetic fixture for scale beyond that. §14 budgets confirmed or adjusted once, before anyone builds against the bundle shape.
- [ ] Frozen `data/e2e-fixture/` committed
- [x] `CategoryPlacement`, rough draft: generated by `pnpm data:routing`, each category at the node with most of its products, shipped in the core tier
- [ ] `CategoryPlacement` (`categoryId → nodeId`) hand-maintained, shipped in the core tier — the only way generic entries resolve
- [ ] Finnish alias table (`aliases.json`), grown continuously — not a one-off task

### Track C — The map

- [x] **Department-level graph, week 1** — the unblocker for Tracks D, E and F. Done as a rough draft from the store's own map, not a source of truth: `data/graph/department-level.json` (§8, `docs/plans/map.md` §5)
- [x] Every department with products placed in a map area — `data/curation/department-areas.json`; 16 rows marked `reviewed: false` to check in the store
- [ ] Editor: click to place nodes, drag to connect, assign shelf IDs, export JSON — **rough version by end of week 2**, polish never
- [ ] Editor autosave to `localStorage` on every change, plus undo _(ready when: editor renders — do this before any bulk tracing session)_
- [ ] Editor exports **one section at a time** to `data/graph/`, merged at build time; several people map in parallel without conflicts
- [x] Coordinate system fixed; floorplan traced schematically — department-level areas from the store's own map, `data/graph/areas.json`, placeholder scale (`docs/plans/map.md`)
- [ ] Shelf polygons drawn, by section
- [ ] Nodes placed: aisle ends, junctions, entrance, checkouts, shelf access points _(done at department level, one access node per area; per shelf section once the editor exists)_
- [ ] Extra attention to connectivity at department boundaries and the checkout area
- [ ] Every shelf ID mapped to a node; unmatched IDs reported back to Track B
- [ ] Verification walk, **step counts recorded per segment**; paced weights replace the geometric defaults
- [ ] Shared SVG primitives extracted to `packages/map-render`

### Track D — Routing

- [x] Dijkstra; all-pairs matrix over only the nodes a list touches (`dijkstra.ts`, run once per stop and entrance)
- [x] Access, checkout and entrance nodes are dead ends: a leg may start or end at one but never pass through it, since a block's centre node joins the aisles on its sides (`docs/plans/map.md` §5)
- [ ] Naive in-order routing, good enough for the first store run
- [x] Held-Karp (≤15 stops) and nearest-neighbour + 2-opt (>15) (`tsp.ts`)
- [ ] Serpentine baseline — the report's comparison number
- [x] Open path: entrance start, checkout end; entrance and checkout chosen with the order
- [ ] Frozen/chilled-last soft constraint
- [x] Generic entries resolved through `CategoryPlacement` before routing _(the generated draft, §7)_
- [x] Route returned as entrance, ordered stops each with its leg, and checkout (`route.ts`; items with no node returned as `unplaced`)
- [x] Unit tests on hand-verified routes _(small hand-made graphs in the tests, not `data/mock/`)_
- [ ] Property tests: starts at entrance, ends at checkout, every stop visited once, total distance matches the legs, **Held-Karp ≤ 2-opt**, frozen-last penalty never worse than with it off

### Track E — Search

- [ ] `String.includes` over 50 mock products — good enough for the first store run, delete later
- [x] `packages/search` engine: Finnish-aware normalisation, infix scan over pre-sorted tiers, early stop (`docs/plans/search.md`)
- [x] Typo tolerance, search-as-you-type
- [x] Alias table wired in, for product and category names
- [x] Ranking by popularity only; unranked last
- [x] Three tiers: tier 1 loaded first, tiers 2–3 straight after in small pieces _(precaching is Track G)_
- [ ] **Measure on the oldest team phone**: cold start to first search, keystroke → results painted, longest freeze while tiers load (§14 targets); an index only if needed. **Not done yet, deferred to a later date**; the in-app benchmark (`?bench`) is ready (`docs/plans/search.md` §11)
- [x] Decide whether products with no Kupittaa location are searchable — not searchable, excluded by `normalise.ts` (§17)
- [x] Category results: add as a generic list entry, or browse the category with its own search
- [ ] Single-item lookup → map pin

### Track F — Frontend

- [ ] App shell, mobile layout, navigation
- [x] List builder, rough version: a closable panel at the bottom of the search screen; add, remove, amount per item, tick; "Laske reitti" opens the route overview; in memory only (§11)
- [x] Route overview, rough version: summary, the route on the store map, start at entrance 1 or switch, edit list, messages for loading and map errors (§11, `docs/plans/route-map.md`)
- [ ] List builder, the rest: reorder; Zustand
- [x] The list survives a refresh: saved to `localStorage`, checked on read, ticks cleared after 12 hours (§11, `docs/plans/device-storage.md`)
- [ ] Purchase history and suggestions: opt-in, on the device only, "Usein ostamasi" on search, withdrawal always reachable (§11, `docs/plans/device-storage.md`)
- [ ] SVG map: shelf polygons, route legs, numbered pins _(rough version at department level: area shapes, the route in green, numbered nodes; shelf polygons wait for the detailed map)_
- [ ] Three path states; animated current leg _(three states done, rough: walked and next deep green, ahead light green; not animated)_
- [ ] Auto-zoom to current leg, full-route toggle _(auto-zoom with a glide on the shopping screen; the overview shows the full route; pinch and pan anywhere)_
- [x] Check-off advances the map _(ticks on the shopping screen; a stop is done when all its items are ticked)_
- [x] Trip summary: stops, distance, time _(on the route overview; minutes rough, at 1 m/s plus 20 s per stop)_
- [ ] Route-mode toggle (TSP / serpentine)
- [ ] URL-encoded list sharing
- [ ] Saved and recurring lists
- [ ] Loading, empty and error states, including the core-present / display-missing degraded note
- [ ] Accessibility pass

### Track G — Offline

- [ ] PWA manifest, service worker, **core tier precached only**
- [ ] Display tier lazy, stale-while-revalidate, IndexedDB keyed on EAN
- [ ] Manifest never cached; content-hashed chunks; changed chunks refetched individually
- [ ] **Verify on a metered connection what a first visit actually downloads** — do this the week the real catalogue lands, not in week 7
- [ ] E2E: core flow, single-item lookup, offline, share link (Playwright, mobile viewport)

### Track H — Validation and report

- [ ] Friday store run, every week from week two — a habit, not a one-off
- [ ] Failure log: wrong routes, stale shelf data, misleading map areas
- [ ] TSP vs serpentine across ~20 generated lists, distance delta recorded
- [ ] Timed run: app-assisted vs unassisted, 15–20 items — the headline result
- [ ] Repeat after fixes, at least once
- [ ] `docs/plans/` kept current as work happens — the report is drafted from these
- [ ] README: architecture, setup, screenshots
- [ ] Report: problem, approach, algorithms, store results, limitations
- [ ] Demo rehearsed end to end, with a recorded fallback in case wifi fails

---

## 14. Build Infrastructure and Tooling

Everything here is either a config line or something that prevents lost work. None
of it is optional-nice-to-have; the items are listed because leaving them out costs
more later than adding them now.

### Workspace management — pnpm workspaces

Required by the `apps/` + `packages/` structure already specified. Plain pnpm
workspaces are sufficient; no build orchestrator is needed at this scale.

### Environment configuration

A single env var switches the data source without a code change:

```
VITE_DATA_SOURCE=mock | synthetic | build
```

Committed as `.env.example`. This is what lets routing work be done against the toy
graph while frontend work runs against real data, simultaneously, without conflicting
edits.

### Data build command

`pnpm data:build` — reads the committed `data/normalised/` output and the graph,
validates them, writes `data/build/`, and stamps a version. It does not normalise:
that is the step before it, `bun run scraper/normalise.ts` (§7 step 2), run by hand
after a scrape. So `data:build` needs neither Bun nor the gitignored scrape cache, and
anyone on the team can run it. Generated artefacts are committed, so the command that
produces them must be reproducible and named. Run locally; CI verifies rather than
regenerates.

### Data budget and bundle tiering

**This is the one place where two stated design properties can contradict each other.**
Offline operation is a headline requirement (§2, §3), and offline means precaching the
catalogue onto a phone. A raw 50k-product scrape can run to tens of megabytes, and
precaching that over cellular is not something users complete. Unbudgeted, the feature
the architecture is built around is the feature that breaks first on a real device.

The catalogue is therefore **not one artefact**. It is split by what routing actually
needs, and the split is enforced in CI rather than left to discipline.

| Tier        | Contents                                                                                                                                            | Caching                                           | Budget (gzipped)      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------- |
| **Core**    | walk graph, map areas, floorplan, categories, primary placements, category placements, category top SKUs and ranks, aliases, the three search tiers | precached by the service worker; required offline | **3 MB, CI-enforced** |
| **Display** | full product records, secondary placements                                                                                                          | lazy, stale-while-revalidate, IndexedDB           | unbudgeted            |
| **Editor**  | map-editor assets                                                                                                                                   | not cached at all                                 | n/a                   |

Core is everything needed to search a query, resolve a list and compute a route. If
core is present, the app is fully functional offline. Display affects only how richly a
result renders, so its absence degrades in one narrow, explainable way (§11).

**Measure before optimising further.** `pnpm seed:synthetic` will produce a
deterministic 50k-product fixture; that is the tool for this. As soon as it exists, run
`data:build` over it and record gzipped size per chunk. Every number above is a
starting budget to be confirmed or adjusted against that measurement, once, early.

**How core stays inside its budget:**

- Only fields the app reads are normalised at all (§6). Price, images and descriptions
  are dropped during normalisation, not filtered at load. The scraper keeps price in its
  own cache and CSV only (§17).
- Category ids are interned integers rather than strings.
- Primary placements ship as a flat `EAN → { nodeId, categoryId }` map, separate from
  the richer `Placement` records. The `categoryId` is there so the frozen-last
  constraint can be applied without the display tier.
- The search tiers carry names, EANs and category ids only, as columns, and split the
  catalogue rather than repeat it. All search files together are **896 KB gzipped**
  (2026-10-04 scrape), and `build-search.ts` fails above 1 MB, the search share of
  this budget.
- The routing files (graph, primary placements, category placements, areas) are
  **225 KB gzipped**, almost all of it primary placements, and `build-routing.ts` fails
  above 512 KB, the routing share.

**Escape hatches, in the order they should be reached for**, if measurement shows core
over budget:

1. Drop words from tier names that no shopper searches for (sizes, packaging codes).
2. Drop `categoryIds` from tier 3 and resolve its category page through
   `placements-primary.json` instead.
3. Only then move **tier 3** out of the precache: fetched in the background after the
   first load and cached for later visits and offline use. Tiers 1 and 2 stay
   precached, so common searches remain instant and offline. Raising the budget
   instead is a legitimate choice, since speed matters more than size (§10), but it is a
   §17 decision, not a quiet CI change. Taking this hatch also requires a "full
   catalogue not downloaded yet" state among §11's loading, empty and error states, and
   a matching change to the E2E offline test, since §10 currently promises no such state.

Shrink the search data before shrinking the catalogue, and shrink the catalogue before
weakening offline. **Do not resolve this by dropping the offline requirement**: a network
dependency inside a steel-and-concrete retail building fails exactly where the app is
used, and it would move a one-time download cost onto every session rather than
removing it.

### Data versioning and cache invalidation

**Not optional.** The service worker caches the data bundle, so without this a phone
keeps serving whatever it cached weeks ago, and the store test silently runs against
stale placements.

- `manifest.json` carries a version, content hashes and per-chunk gzipped sizes, and
  is **never** cached
- Bundle filenames are content-hashed
- App checks the manifest on load and refetches only changed chunks

### Frozen E2E fixture

E2E runs against `data/e2e-fixture/` only, never the live bundle. Otherwise every
scrape breaks the test suite, and once CI is red by default people stop reading it.

### Synthetic seed generator

`pnpm seed:synthetic` produces a deterministic 50k-product catalogue on a ~400-node
graph from a fixed seed. Needed for performance testing and for property tests over
the routing engine at realistic scale. Roughly fifty lines.

### Pre-commit hooks

Husky + lint-staged. Formatting and lint fixes applied locally instead of failing CI
five minutes later. Fifteen minutes to set up, saves repeated round-trips across six
contributors.

### Map editor: autosave and undo

The editor must autosave to `localStorage` on every change and support undo. Several
hundred nodes get placed across multiple sessions, often by different people, and
losing an afternoon of that work is a real setback with no recovery path. Build this
before the first bulk mapping session, not after.

### Performance targets

Set numbers rather than assuming, and test on the **oldest phone in the team**, not a
development PC:

- **Keystroke to results visible under 50 ms**
- Route computation under 500 ms for a 20-item list
- Map interaction at 60 fps while panning
- **App open to first usable search (tier 1) under 500 ms**, warm cache, on that
  phone. This is the target tier 1 (149 KB gzipped) exists to hit; fast queries are
  meaningless if the data takes seconds to become available.
- **"maito" shows a milk as the first result within 1–3 keystrokes**
- **Core tier under 3 MB gzipped**, enforced in CI rather than checked by hand

---

## 14b. Considered, Build If Time Allows

Possibilities rather than commitments. None blocks anything.

- **A11y assertion in CI** — `@axe-core/playwright` added to existing E2E flows, one
  line per test. Turns the Track F accessibility bullet from an intention into
  something enforced, and it is straightforward marks in the report.
- **Local event log** — searches returning nothing, items failing to resolve, route
  computation times, written to `localStorage` and exportable as JSON. Worth it only
  if the report makes quantitative claims about search quality. If the headline
  results are route distance and trip time, skip it.
- **Map editor diff view** — shows what changed against the committed graph before
  export. Genuinely useful for reviewing map pull requests, but it is a feature
  rather than a config line. Build only if the editor lands early.

### Deliberately not adopted

Recorded so they are not re-proposed mid-project: Storybook (a plain `/dev` route
covers it), Turborepo (builds are seconds), visual regression testing (flaky across
runners), Lighthouse CI (run it manually once for the report), Sentry (six users, all
sitting in the same room), automated release tooling (tag two commits by hand), a
weekly scheduled scrape (one full scrape plus one re-scrape before the demo is enough
for a non-commercial school project).

---

## 15. CI / CD

**The repository is public.** This gives unlimited GitHub Actions minutes on Linux
runners, free Codecov, and doubles as a portfolio artefact. Nothing in the project
is sensitive: the scraped data is public product information, and the only
credential is the Codecov upload token, kept in GitHub Secrets.

Every tool below is free and open source. Total cost of this pipeline is zero.

The highest-value job here is **not** lint or unit tests. It is data validation,
because the worst failure mode is a route that confidently sends a user to a shelf
that does not exist, and no amount of React testing catches that.

### On every PR

- **Lint** — ESLint + Prettier `--check`, runs first, fails fast
- **Typecheck** — `pnpm typecheck`, which runs `tsc` in every workspace
- **Unit tests + coverage** — Vitest; **85% threshold on `packages/core` only**, no
  threshold on React components (enforcing it there just produces assertion-free
  render tests written to hit a number)
- **Build** — both `apps/web` and `apps/map-editor`
- **Codecov upload** — comments the coverage delta on the PR

### On PRs touching `data/` or `scraper/`

- Zod schema validation over every core and display chunk, `graph.json` included
- No duplicate EANs
- Referential integrity: every `placement.shelfId` matches a shelf in the graph, or its
  department's `:00` shelf (§7), every shelf's `accessNodeId` and every
  `CategoryPlacement.nodeId` exists as a node
- Every product has exactly one `isPrimary` placement
- **Graph connectivity**: all nodes reachable from the entrance, no orphans
- The map files: every area and entrance valid, every department with products placed in
  an area and given a `:00` shelf. **Already run** as unit tests over the committed files
  (`scraper/normalise/schema.test.ts`), as are the graph's reference, edge and
  connectivity checks above
- Edge sanity: no zero or negative weights, both endpoints exist, and no edge appears
  twice in either direction (edges are stored once; the router walks them both ways)
- Unmatched shelf ID count below an agreed threshold — fails loudly rather than
  degrading silently
- **Core tier budget: gzipped total under 3 MB, failing the build if exceeded.** Not a
  warning. A warning gets merged. This is the check that keeps the offline requirement
  and the catalogue size from quietly diverging over six contributors and eight weeks.
- No display-tier field appears in a core-tier chunk (schema separation holds)
- Every searchable product is in exactly one search tier; tiers 1–2 hold no unranked,
  clothing or uncategorised product; each tier is in rank order (`build-search.ts` runs
  these before writing)
- Every EAN in `category-top.json` exists in a search tier

The connectivity check alone catches most map-editor mistakes in minutes, instead of
during the store walk.

### Routing invariants (property tests)

- Route starts at the entrance, ends at the checkout
- Every requested stop visited exactly once
- Reported `totalDistance` equals the sum of every `legDistance`, and each
  `legDistance` matches the length of its leg
- **Solver cross-check** — on lists of ≤15 stops (the whole Held-Karp range), assert Held-Karp distance ≤ 2-opt
  distance. If the heuristic ever wins, one solver is broken. This also produces
  benchmark data for the report as a side effect.
- **Frozen-last never makes things worse** — on lists of ≤15 stops (Held-Karp, exact),
  the route's frozen/chilled penalty with the constraint on is ≤ the penalty of the same
  list routed with it off. The constraint is soft, so it cannot promise a fixed position;
  this is the property an exact solver does guarantee.

### E2E (Playwright, mobile viewport)

- **Core flow** — search "maito" → add to list → generate route → map renders with
  correct pin count → check off item → current leg advances
- **Single-item lookup** — search → result → map pin
- **Offline** — load app, set browser context offline, verify search and routing still
  work, including a product that is only in tier 3. Offline is
  a headline design decision, so it should be verified rather than assumed.
- **Share link** — encode list to URL, load in a fresh context, verify restoration

Keep E2E to these few flows. Large suites on a student timeline become a tax nobody
pays.

### On merge to `main`

- Deploy `apps/web` to Netlify production
- `apps/map-editor` is local-only and never deployed

### Repository configuration

- **Branch protection on `main`** — lint, typecheck, unit tests and build must pass
  before merge.
- **One required review from someone who did not write the change**, enforced by the
  "required approving reviews" branch-protection setting. Passing checks do not
  enforce reviews; this setting does.
- There are **two exceptions** to the one-review rule:
  - **Two reviews on `packages/core` type changes**, since they ripple into
    everyone's work in progress. This is not automated: the header of `types.ts`
    states it, and the first reviewer asks for a second before approving.
  - **`.claude/rules.md` changes are merged only alongside a decision recorded in §17**
- **Path filters** — map-editor changes skip E2E, data changes skip the frontend build,
  `docs/` changes run lint only
- **`concurrency` group with `cancel-in-progress`** — superseded pushes cancel runs
- **Cache pnpm store and Playwright browsers**, or install time dominates runtime
- **`ubuntu-latest` only** — macOS bills at 10×, and Linux is unlimited on public repos

### Optional, low effort

- **Preview deploys per PR** — lets anyone check map changes on a phone without
  pulling the branch
- **Dependabot** — weekly, grouped, low noise

### One size caveat

Two separate size questions, often confused.

**In the repository**, the committed catalogue including the display tier may run to
tens of megabytes. Git handles that fine; GitHub warns above 1 GB and hard-limits
individual files at 100 MB. If a chunk approaches the limit, gzip it or move it to a
release asset. **Do not use Git LFS** — it is the one thing in this stack with a paid
tier.

**On the device**, only the core tier is precached, and it is budgeted at 3 MB and
enforced above. Repository size is a convenience problem. Device size is an
architectural one, and it is handled in §14, not here.

---

## 16. Risks

| Risk                                            | Impact                                                                               | Mitigation                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map editor slips**                            | Blocks all mapping, blocks everything downstream                                     | Ship an ugly version by week 2; polish later. Department-level graph by hand in week 1 so nothing waits on it                                                                                |
| **Mapping takes longer than estimated**         | Critical path                                                                        | Mapping needs booked sessions, not spare moments; schematic fidelity, not measured                                                                                                           |
| **Shelf IDs do not match reality**              | Routes send users to the wrong place                                                 | Verification walk; log unmatched IDs loudly                                                                                                                                                  |
| **Finnish search underperforms**                | Users cannot find items                                                              | Alias table; test with real shopping lists early                                                                                                                                             |
| **Integration reveals schema drift**            | Late rework                                                                          | Contract sprint up front; the weekly Friday store run exercises the integrated app every week                                                                                                |
| **Store rearranges mid-project**                | Data goes stale                                                                      | Diffing script; re-scrape before the demo                                                                                                                                                    |
| **Without roles, nobody owns the tedious work** | Bulk map tracing and the alias table stall; work is duplicated or dropped            | One name per card while in flight, WIP limit of two, unclaimed cards raised at standup                                                                                                       |
| **Core bundle outgrows its budget**             | Offline install fails on real phones; the headline feature dies quietly              | Measure on the partial real scrape, then the synthetic fixture for scale, before anyone builds against the bundle shape; CI gate that fails rather than warns; escape hatches ordered in §14 |
| **Popularity misranks in-store habits**         | Kesko's score likely reflects online orders; bulky items rank high, impulse buys low | Full index always searchable; aliases and boosts; ranking drift noted as a limitation, re-scraped once before the demo                                                                       |

**The two highest-risk items are the map editor and the in-store validation run.**
Start the map early, and book the store visit well before the deadline so there is
time to fix what it reveals.

---

## 17. Decisions Made

| Question                                   | Decision                                                                                                                                                                                                                                          | Why                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic vs SKU list entries                | **Both, generic by default**; generic resolves through `CategoryPlacement` before routing                                                                                                                                                         | Matches how people write lists; avoids the generalised TSP in the MVP                                                                                                               |
| Serpentine vs TSP                          | **TSP default**, serpentine implemented as benchmark and fallback toggle                                                                                                                                                                          | TSP is the graded substance; the baseline turns a claim into a measured result                                                                                                      |
| Supabase for shared lists                  | **No backend.** Sharing via URL-encoded list state                                                                                                                                                                                                | Accounts and sync add risk and weaken offline, and demonstrate nothing the course assesses                                                                                          |
| Floorplan fidelity                         | **Schematic throughout**; edge weights default to geometric distance, replaced by pace counts once walked                                                                                                                                         | Routes depend on topology and relative distance, not absolute geometry                                                                                                              |
| Team structure                             | **No roles.** Ownership per task, WIP limit of two                                                                                                                                                                                                | Six people who each understand one sixth of the system cannot review each other's work or write the report                                                                          |
| Repo visibility                            | **Public**                                                                                                                                                                                                                                        | Unlimited Actions minutes, free Codecov, portfolio value; nothing sensitive in the repo                                                                                             |
| Catalogue delivery                         | **Tiered**: budgeted core precached, display lazy via IndexedDB                                                                                                                                                                                   | A single unbudgeted bundle makes offline, the headline feature, the first thing to break on a real phone                                                                            |
| Drop the offline requirement to solve size | **Rejected**                                                                                                                                                                                                                                      | Fails inside the building the app exists for, and turns a one-time download into a per-session one; it also removes the justification for the whole no-backend design               |
| Search index construction                  | **No index**: a scan over tiers stored in rank order, stopping at the 20th match; FlexSearch or a trigram index only if the phone bench misses §14                                                                                                | An infix index for Finnish compounds would hold ~490k terms; the scan costs ~2 ms for a full pass and needs no build at startup                                                     |
| Server-side database for the catalogue     | **No** (client-side IndexedDB instead)                                                                                                                                                                                                            | A backend reintroduces latency, deploy dependency and the loss of offline search, and demonstrates nothing the course assesses                                                      |
| Route shape                                | **Split into legs**: `start`, item `stops` each carrying the leg that reaches it, and `end` with the final leg; no single polyline                                                                                                                | Map needs per-leg greying, highlighting and auto-zoom; pin numbers match the list because entrance and checkout are not stops                                                       |
| Graph format                               | `{ version, nodes, edges, shelves }`, edges stored once, shelves as data                                                                                                                                                                          | One format for editor, router and CI; shelves must be clickable and matchable                                                                                                       |
| Coordinates                                | **Metres**, origin top-left, y down                                                                                                                                                                                                               | Edge weights can default to geometric distance until paced; no unit conversions                                                                                                     |
| List items                                 | `id` + `quantity` on every `ListItem`                                                                                                                                                                                                             | Stable identity for reorder, check-off and React keys                                                                                                                               |
| Rendering code                             | Pure geometry in `core`, React SVG in `map-render`                                                                                                                                                                                                | `core` stays framework-free                                                                                                                                                         |
| Graph source                               | `data/graph/` per section; merged into `data/build/core/graph.json`. Until the editor exists: one rough `department-level.json`                                                                                                                   | Parallel mapping without conflicts; hand-edited and generated files kept apart                                                                                                      |
| Map source                                 | **K-Citymarket's own store map**, traced from its SVG; the SVG is not committed                                                                                                                                                                   | Exact outlines for free; the map is theirs and the repo is public                                                                                                                   |
| Shelves before the detailed map            | **One `<department>:00` shelf per department**; any other shelf ID falls back to it                                                                                                                                                               | Every product routable now, with no change to the contract                                                                                                                          |
| Entrance and checkout                      | **Chosen by the router**: every entrance reaching all stops is tried; the checkout is the one nearest the last stop, chosen with the order                                                                                                        | Two entrances and three checkouts; fixing one of each makes some lists visibly longer                                                                                               |
| Split map                                  | **A map error, thrown**: two stops that can't reach each other, or no entrance reaching all of them, stop the route                                                                                                                               | Leaving a stop out silently would send the shopper home without it                                                                                                                  |
| Access nodes                               | **Dead ends** for the router, as are checkouts and entrances; a block open on several sides has one node at its centre                                                                                                                            | One `accessNodeId` per shelf, reachable from every side, never a shortcut through shelves                                                                                           |
| Ids from Finnish names                     | Lowercase kebab-case, **å, ä and ö kept**                                                                                                                                                                                                         | They are letters of their own; folding them changes the word                                                                                                                        |
| Placement → node                           | Placement stores `shelfId` only; node derived from `Shelf.accessNodeId` at build time                                                                                                                                                             | One source of truth for where you stand to reach a shelf                                                                                                                            |
| Shelf ID format                            | `<departmentId>:<shelf>`; `:00` is the department-wide shelf, drawn as one area                                                                                                                                                                   | Shelf numbers repeat in every department; about half of all products have a department but no shelf, and this routes them without a type change                                     |
| Generic entries before a hand-made table   | **Generated**: each category at the node holding most products of it and its subcategories                                                                                                                                                        | Every generic entry routable now; replaced row by row once the table is hand-maintained                                                                                             |
| Core placement data                        | `EAN → { nodeId, categoryId }` plus `CategoryPlacement`, both core tier                                                                                                                                                                           | Core alone must resolve every list entry and apply the frozen-last constraint                                                                                                       |
| Search payload                             | Columnar `{ eans, names, categoryIds }` per tier                                                                                                                                                                                                  | Offline results render a name without the display tier; `categoryIds` (49 KB gzipped) lets the category page work before the graph exists                                           |
| Search ranking and loading                 | **Ranked by Kesko popularity only**, no boosts. **Three tiers**: most popular food (equal share per food category, ~8,000), then remaining popular food plus popular non-clothing (~10,000), then the rest. Tier 1 loads first; **all precached** | Speed over size: nobody should wait to find milk. Word-start ranking was rejected on real data (`leipä` put cheese above bread). Popularity decides load order, not what is offline |
| Search code                                | **`packages/search`**, separate from `core`; build-time code is a separate export                                                                                                                                                                 | The runtime and the data build must share one normalisation; `core` stays small for the router                                                                                      |
| Category results                           | Shown when a query word of 3+ letters matches a category name; at most 3, most specific first; **add as generic** or **browse** with its own search                                                                                               | Category names are plural and nested; "maito" must add milk, not all of dairy                                                                                                       |
| Category top SKUs                          | Prebuilt `category-top.json` in core                                                                                                                                                                                                              | Lets generic matches show popular SKUs without shipping popularity on `Product`; types.ts unchanged                                                                                 |
| Search speed targets                       | Keystroke → results under **50 ms**; app open → first search under **500 ms**; milk first within 1–3 keystrokes                                                                                                                                   | Replaces the earlier 100 ms / 2 s targets; tier 1 exists to hit them                                                                                                                |
| Hosting                                    | **Netlify**                                                                                                                                                                                                                                       | `netlify.toml` committed; static deploy with HTTPS                                                                                                                                  |
| Map editor deployment                      | **Local-only**                                                                                                                                                                                                                                    | Used at a desk by one person; no reason to host it                                                                                                                                  |
| Scraper                                    | **`scraper/export-kupittaa.ts`**, reusing the `p18a/mcp-k-ruoka` browser session from a sibling clone                                                                                                                                             | Returns store-specific name, price, popularity and shelf location; upstream has no licence, so its code is loaded at runtime, not copied                                            |
| Scrape cache                               | **Trimmed records, not raw responses**                                                                                                                                                                                                            | Raw product responses are ~12 KB each, about 0.5 GB per store; missing fields have so far been recovered by re-running the listing                                                  |
| Price                                      | **Allowed in `scraper/cache/` and `kupittaa.csv` only**, never in `data/` (normalised or build)                                                                                                                                                   | People use the CSV; prices are out of scope for the app (§2) and the core tier is budgeted (§14)                                                                                    |
| Products with no Kupittaa location         | **Not searchable**; `normalise.ts` excludes them as `no-location`, listed in `report.md`                                                                                                                                                          | They cannot be routed, and they are web-shop items (mostly clothing and shoes) that k-ruoka.fi shows no store location for either                                                   |
| List and history storage                   | **`localStorage` on the device only**; versioned keys, checked on read                                                                                                                                                                            | No backend, as for shared lists; the data is small and read synchronously, so the list shows on the first render                                                                    |
| Consent for list and history               | **None for the list; opt-in for the history**, asked on the finish card until answered, off by default; withdrawal always one tap away on search                                                                                                  | The ePrivacy rule on storing data on a device exempts only what is strictly necessary for a service the user asked for: their own list is, suggestions are not                      |

### Documented as future work, not as oversights

- **Generalised TSP** — allowing generic entries to be satisfied at any of several
  candidate nodes, rather than the single `CategoryPlacement` node only
- **Server-backed shared household lists** — only if the app sees real use after
  submission
- **Measured floorplan** — if a later version needs accurate distance display

### Still open

- The map's scale: 0.22 m per map unit is a placeholder until one building measurement is
  taken (`docs/plans/map.md` §3)
- Stride length calibration for pace counting (measure per person, or agree one value)
- Whether the route-mode toggle is user-visible or a developer flag
- How many test lists the benchmark uses, and how they are generated
- Whether the scan alone meets the §14 targets on the oldest team phone, or an index is needed.
  No phone has been tested yet; the run is deferred (`docs/plans/search.md` §11)
