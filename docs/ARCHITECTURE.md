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
- Offline operation inside the store
- Mobile-first web app

### Out of scope

- Live indoor positioning
- Multiple stores
- User accounts, server-side sync, payments, commercial operation
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
│  Scraper (Python)  │   offline, run manually / scheduled
│  K-Ruoka → JSON    │
└─────────┬──────────┘
          │ products.json, placements.json
          ▼
┌────────────────────┐        ┌──────────────────────┐
│   data/ bundles    │◄───────│  Map Editor (React)  │
│  core: graph, plan,│        │  internal tool       │
│  placements, index │        │  graph.json,         │
└─────────┬──────────┘        │  floorplan.svg       │
          │                   └──────────────────────┘
          │ bundled at build
          ▼
┌─────────────────────────────────────────────────────┐
│                  Web App (React PWA)                │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │  Search   │  │   List    │  │    Map View     │  │
│  │ FlexSearch│  │  Zustand  │  │   inline SVG    │  │
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

| Layer              | Choice                                                     | Rationale                                                      |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Frontend framework | React + TypeScript                                         | Team knows React; types catch graph/route errors early         |
| Build tool         | Vite                                                       | Fast dev server, simple PWA plugin                             |
| Styling            | Tailwind CSS                                               | Fast iteration, no CSS architecture debate                     |
| Map rendering      | Hand-written inline SVG                                    | Own coordinate system, not geographic tiles                    |
| Pan / zoom         | `d3-zoom` (only this module)                               | Pinch-zoom without pulling in all of D3                        |
| Pathfinding        | Own Dijkstra (or `ngraph.path`)                            | Small, and it is the interesting part of the report            |
| TSP                | Own implementation                                         | Held-Karp + 2-opt, written in-house                            |
| Search             | FlexSearch, client-side, index prebuilt at data-build time | Works offline; moves index construction out of app startup     |
| State              | Zustand                                                    | Lighter than Redux, avoids prop-drilling to the map            |
| Persistence        | `localStorage` (lists) + IndexedDB (display records)       | Lists are tiny; full product records should not sit in JS heap |
| PWA                | `vite-plugin-pwa`                                          | Manifest + service worker with minimal config                  |
| Scraper            | Python + `httpx` + `selectolax`                            | Better ergonomics for scraping and cleanup                     |
| Hosting            | Netlify or Vercel, free tier                               | Static deploy, HTTPS included (required for PWA)               |

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
│   ├── validate-data.ts     Zod schemas + graph integrity checks
│   ├── build-data.ts        scraper output → data/build/, stamps version
│   └── seed-synthetic.ts    deterministic 30k-product / 400-node fixture
│
├── .env.example             committed; VITE_DATA_SOURCE etc.
│
├── scraper/                 Python, outputs JSON
│   ├── fetch.py             rate-limited fetch + raw response cache
│   ├── normalise.py         raw → schema
│   ├── diff.py              compare scrapes, report moved/removed products
│   └── cache/               raw responses, gitignored
│
├── data/
│   ├── graph/               SOURCE: hand-edited in the map editor, one file per section
│   │   └── connections.json edges that cross between sections
│   ├── mock/                hand-made fixtures, committed, used from day 1
│   ├── e2e-fixture/         frozen bundle, E2E runs against this only
│   ├── synthetic/           generated, realistic scale, for perf + property tests
│   └── build/               generated bundles, committed
│       ├── manifest.json    version + content hashes + tier sizes, never cached
│       ├── core/            precached, required offline — budgeted, see §14
│       │   ├── graph.json
│       │   ├── floorplan.svg
│       │   ├── categories.json
│       │   ├── placements-primary.json   EAN → nodeId
│       │   ├── aliases.json
│       │   └── search-index.json         prebuilt FlexSearch export
│       └── display/         lazy-loaded, unbudgeted
│           ├── products.json             full records, keyed on EAN
│           └── placements-secondary.json end-caps, promo spots
│
├── packages/
│   ├── core/                shared, framework-free, unit-tested
│   │   ├── types.ts         the data contract — see docs/plans/contract.md
│   │   ├── geometry.ts      pure geometry: lengths, bounds, fit-to-view
│   │   ├── dijkstra.ts
│   │   ├── tsp.ts
│   │   └── route.ts         orchestration: list → Route
│   └── map-render/          React SVG components shared by both apps
│
└── apps/
    ├── web/                 the shopping app
    └── map-editor/          internal tool, not deployed publicly
```

Putting the algorithms in `packages/core` means both apps share the same code and
gives a clean place for unit tests, which is worth marks in the report.

### `.claude/` — AI tooling, committed

Agent configuration lives in the repository, not in six people's local setups.
Committed, reviewed and versioned like any other code.

- **`rules.md`** — the architectural invariants an agent must not violate: EAN is the
  key, the core tier is budgeted, generic entries collapse to their primary placement
  before routing, no backend, agents propose and humans commit. Short, and updated when
  a decision in §17 changes.
- **`agents/`** — subagent definitions. Reviewing, not writing: agents report findings
  and humans make the edits and the commits.
- **`skills/`** — skill definitions for the repeatable procedures in this document, such
  as running `data:build` and interpreting the budget report.

Set up in Phase 0 and grown as the project reveals what is actually worth automating.
The point is that six people get the same behaviour from the same tools.

### `docs/` — this document and what follows it

This architecture document lives in `docs/ARCHITECTURE.md` and is the reference for
what the system is meant to be.

`docs/plans/` holds implementation plans written by developers as they work: one
markdown file per feature or work package, written before the code and committed
alongside it. They record how a piece was approached and why, at a level this document
deliberately does not descend to. Cheap to write, and they are what the report gets
drafted from in Phase 8 instead of reconstructing eight weeks of decisions from memory.

---

## 6. Data Model

### Core types

The source of truth is `packages/core/src/types.ts`; the reasoning is in
`docs/plans/contract.md`. The types are not repeated here, so the two cannot drift apart.

---

### Notes

- **Key on EAN/GTIN.** Product names change constantly; barcodes do not.
- **Only fields the app reads are kept.** Price, images, descriptions and marketing
  copy are discarded during normalisation. Prices and stock levels are out of scope
  (§2), and the catalogue is precached onto phones, so every unused field is dead
  weight shipped to every user. See the data budget in §14.
- **Placements are one-to-many.** A product can appear in its home aisle, on a
  promotional end-cap, and in a cooler near the checkout.
- **`temperature` on category** drives the frozen-last routing constraint.
- **Both entry kinds are supported; generic is the default.** People write "maito",
  not a specific SKU, and which carton gets picked is decided at the shelf. Forcing
  SKU selection would move twenty decisions from the store to the sofa and make the
  app slower than a paper list. SKU-level entries still exist, for single-item
  lookup and for cases where the exact product matters. Search surfaces category
  matches above product matches for generic queries.

- **Generic entries resolve to their primary placement node before routing.** A
  generic entry is in principle satisfiable at several nodes, since milk sits both
  in the dairy aisle and in the cooler by the checkout. Letting the router choose
  turns the problem into a _generalised_ TSP, where each stop is a set of candidate
  nodes rather than a single node, which is meaningfully harder.

  The MVP therefore collapses each generic entry to `isPrimary: true` before the
  route is computed. The generalised version is documented as future work in the
  report — an identified limitation, not an unnoticed one.

---

## 7. Data Pipeline

1. `fetch.py` pulls product pages, rate-limited, writing raw responses to
   `scraper/cache/`. Development never re-hits the site.
2. `normalise.py` parses the cache into `products`, `placements`, `categories`,
   deduplicating on EAN.
3. Shelf IDs are matched against `graph.json`. **Unmatched shelf IDs are logged as
   errors, not silently dropped** — this list is the handoff between the data owner
   and the map owner.
4. `diff.py` compares against the previous scrape and reports what moved, appeared,
   or disappeared. Stores rearrange; this is how you notice.
5. `build-data.ts` **builds the FlexSearch index and exports it**, so the app never
   constructs an index at startup. The index carries names and aliases only, with the
   EAN as its sole payload.
6. Output is **split into core and display tiers** (§14) and written to `data/build/`,
   committed, so the app build is reproducible. `manifest.json` records the gzipped
   size of each chunk.

**Scraping etiquette:** rate-limit, cache aggressively, scrape once into a bundle
rather than hitting K-Ruoka live per user request. The project is non-commercial and
unaffiliated, so avoid K-Citymarket branding in the UI.

---

## 8. The Map

The floorplan is the most labour-intensive part of the project and sits on the
critical path.

### Representation

- **Shelf polygons** — SVG paths in a local coordinate system with a known scale
- **Walk graph** — nodes at aisle ends, junctions, entrance, checkouts, plus one
  access point per shelf section; edges weighted by real distance

### Fidelity — schematic, decided

Route correctness depends on **topology and relative distances**, not absolute
geometry. Whether aisle 7 connects to the back walkway matters enormously. Whether
it is 31.4 m or 33 m long changes nothing about the stop order. A visually
approximate map with correct connectivity produces the same routes as a surveyed one.

Go schematic and do not revisit it. Time saved here goes into the walk graph instead.

The one place to spend extra care is connectivity **around department boundaries and
the checkout area**, since a missing edge there causes a visibly stupid detour.

### Edge weights — pace counting

Do not measure the store. During the verification walk, count steps per aisle segment
and multiply by stride length. That yields weights accurate to roughly 10%, which is
more than enough for route optimisation and good enough to display "about 640 m,
12 minutes" without embarrassment.

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
the shelf labels on the floor.

---

## 9. Routing Engine

The problem is an **open Travelling Salesman Problem** (fixed start at the entrance,
fixed end at the checkout) layered on top of shortest-path search.

**Pipeline:**

1. Resolve each list item to a target node (generic items resolve to a shelf area).
2. Run Dijkstra to build an all-pairs distance matrix over only the nodes this list
   touches.
3. Solve the TSP over that matrix:
   - **≤ 15 stops** — Held-Karp, exact optimum, runs instantly
   - **> 15 stops** — nearest-neighbour + 2-opt, within a few percent
4. Apply the **frozen/chilled-last soft constraint** — a penalty for visiting
   temperature-controlled stops early. Real shoppers care about this, and it
   differentiates the result from a pure distance optimiser.
5. Expand the stop order back into a full polyline of coordinates.

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
`luomumaito`. Compounding and inflection defeat naive substring matching.

- **FlexSearch** index built at load time, configured with a custom tokenizer
- **Typo tolerance** and search-as-you-type
- **Alias table** (`aliases.json`), hand-maintained, covering colloquialisms, brand
  shorthand, and common misspellings
- **Ranking** biased toward primary placements and common products
- **Generic resolution** — a query that matches a category rather than a product
  produces a generic list entry

Client-side search keeps everything working offline.

---

## 11. Frontend

### List builder

Add, remove, reorder, check off. Saved and recurring lists in `localStorage`.
**Share via link:** list state encoded into the URL, decoded on load. No accounts.

### Route mode

Default optimised (TSP). Toggle for aisle-order (serpentine), used as the report
baseline and as a fallback when an optimal route looks unintuitive in the store.

### Map view

Inline SVG in three layers: shelf polygons, route polyline, markers.

- **Numbered pins** on target shelves, matching the numbered list below the map
- **Three path states** — completed legs greyed, current leg highlighted and
  animated, upcoming legs faint
- **Animated current leg** via `stroke-dasharray` + a CSS animation on
  `stroke-dashoffset`; roughly four lines of CSS, disproportionate perceived polish
- **Auto-zoom to the current leg** on mobile, with a full-route toggle. A whole-store
  view on a phone screen is unreadable.
- **Check-off advances the map** — one interaction marks the item collected and moves
  to the next leg

### Trip summary

Stop count, estimated distance, estimated time.

### Offline

Manifest, service worker, precached app shell and **core tier only** (§14). Chunks are
content-hashed individually so one can be updated without redownloading everything.

The display tier is fetched lazily, stale-while-revalidate, and cached in IndexedDB
keyed on EAN. Search, list building, routing and the map therefore work with no
network at all.

**Degraded state, when core is present and display is not:** results and list entries
render with the name from the search index and without brand or secondary-placement
information. Nothing is blocked and no route is affected. This is the only offline
degradation in the app and it should be shown as a quiet inline note, not an error.

---

## 12. How the Team Works

There are no fixed roles. Everyone is expected to touch every part of the system at
least once, and specialisation is allowed to emerge from who picks up what rather than
being assigned up front. On an eight-week project this is also the point: six people
who each understand one sixth of the system cannot write the report, cannot cover for
each other, and cannot review each other's pull requests meaningfully.

What replaces roles is **ownership per task, not per area**.

### Contract sprint — everyone, first 3 days

Unchanged, and more important without roles than with them.

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

### The one rotating job

**Release captain, one week at a time, rotating through all six.** The captain runs
the Friday store run, owns the deploy, triages the board on Monday, and calls the
two 15-minute standups. It is a shift, not a title, and everyone takes it at least once.

Nothing else is a standing job. CI, `packages/core` and the data build have no
permanent owner; the person who touches them next owns them for that change.

### Review

- **One required review, from someone who did not write the change.** Branch
  protection enforces this, not a person.
- **Changes to shared types in `packages/core` need two reviewers**, because they
  ripple into everyone's work in progress. This is the only exception.
- **`.claude/rules.md` changes are reviewed by whoever is release captain that week**,
  and only alongside a decision recorded in §17.

### Cadence

- Two 15-minute standups per week: what is claimed, what is blocked, what is unclaimed
- **Friday store run** — see §13
- Pairing encouraged across tracks, specifically so nobody becomes the only person who
  understands the router or the graph format

---

## 13. Work Checklist

Organised by track rather than by person. Anything whose dependencies are met is
claimable by anyone.

Milestones are the gates that matter. A milestone is met when someone **other than the
person who built it** demonstrates it on the deployed app — not when the boxes beneath
it are ticked. Boxes describe work; milestones describe working software.

### Milestones

| #      | By         | Exit criterion — demonstrated, not declared                                                                                                                           |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | end week 2 | Standing in K-Citymarket, on a phone, on the deployed URL: a 4-item list produces a route a person can actually follow. Ugly is fine. Stubs everywhere are fine.      |
| **M2** | end week 5 | Same flow, with every stub replaced: real scraped catalogue, real traced map, TSP, FlexSearch. A 15-item list routes in under 500 ms on the oldest phone in the team. |
| **M3** | end week 6 | Aeroplane mode, cold cache cleared, phone reconnected only long enough to install: search, list, route and map all work with the network off.                         |
| **M4** | end week 8 | Two timed store runs completed, TSP-vs-serpentine benchmark recorded, report drafted from `docs/plans/`, demo rehearsed with a recorded fallback.                     |

**The standing invariant:** the deployed app routes a real list in the real store every
Friday from week two onward. If it does not, that is the only thing anyone works on
Monday. This outranks every checkbox below.

### Track A — Setup and infrastructure

- [ ] Scope agreed in writing; course deliverables and deadline identified, plan worked backwards from it
- [ ] Repo created **public**, pnpm workspaces configured, branch conventions set
- [ ] `.env.example` committed with `VITE_DATA_SOURCE=mock | synthetic | build`
- [ ] Pre-commit hooks (Husky + lint-staged)
- [ ] CI skeleton: lint, typecheck, unit tests, build, branch protection, one required review
- [ ] `.claude/` in place: `rules.md`, `agents/`, `skills/`, committed
- [ ] `docs/` in place, this document at `docs/ARCHITECTURE.md`, `docs/plans/` created
- [ ] Contract sprint completed, `data/mock/` committed
- [ ] `pnpm seed:synthetic` — deterministic 30k-product / 400-node fixture _(ready when: types are agreed)_
- [ ] CI data-validation job: Zod schemas, duplicate EANs, referential integrity, graph connectivity, edge sanity _(ready when: `data/mock/` exists)_
- [ ] CI core-tier budget gate, **failing** rather than warning _(ready when: `data:build` produces a manifest)_
- [ ] Path filters, concurrency + cancel-in-progress, pnpm and Playwright caches
- [ ] Netlify/Vercel deploy on merge to `main` — **needed for M1, not later**

### Track B — Product data

- [ ] **Reconnaissance visit, week 1.** Check twenty scraped shelf IDs against physical shelf labels. The entire design assumes these match; find out before three weeks are spent on it
- [ ] `fetch.py` — rate-limited, raw responses cached to `scraper/cache/`
- [ ] `normalise.py` — raw → schema, EAN dedup, multi-placement handled, **no price, images or descriptions**
- [ ] Full scrape reviewed by hand for junk, duplicates, missing shelves
- [ ] Shelf IDs matched against `graph.json`; unmatched logged as errors, never dropped _(ready when: a real graph exists at any fidelity)_
- [ ] `diff.py` — compare scrapes, report moved / new / removed
- [ ] `pnpm data:build` — versioned bundles, manifest, **core/display tier split**, search index prebuilt and exported
- [ ] **Size measurement over the synthetic fixture**: gzipped size per chunk recorded, §14 budgets confirmed or adjusted once, before anyone builds against the bundle shape
- [ ] Frozen `data/e2e-fixture/` committed
- [ ] `CategoryPlacement` (`categoryId → nodeId`) hand-maintained — resolves generic entries, and the fallback when a product's shelf ID is unmatched
- [ ] Finnish alias table (`aliases.json`), grown continuously — not a one-off task
- [ ] Weekly scrape cron auto-opening a GitHub issue on placement changes

### Track C — The map

- [ ] **Department-level graph, week 1**: ~20 nodes traced from a photo of the store's own directory sign. One hour. This is what unblocks Tracks D, E and F
- [ ] Editor: click to place nodes, drag to connect, assign shelf IDs, export JSON — **rough version by end of week 2**, polish never
- [ ] Editor autosave to `localStorage` on every change, plus undo _(ready when: editor renders — do this before any bulk tracing session)_
- [ ] Editor exports **one section at a time** to `data/graph/`, merged at build time; several people map in parallel without conflicts
- [ ] Coordinate system fixed; floorplan traced schematically
- [ ] Shelf polygons drawn, by section
- [ ] Nodes placed: aisle ends, junctions, entrance, checkouts, shelf access points
- [ ] Extra attention to connectivity at department boundaries and the checkout area
- [ ] Every shelf ID mapped to a node; unmatched IDs reported back to Track B
- [ ] Verification walk, **step counts recorded per segment**; edge weights derived from pace counts
- [ ] Shared SVG primitives extracted to `packages/map-render`

### Track D — Routing

- [ ] Dijkstra; all-pairs matrix over only the nodes a list touches
- [ ] Naive in-order routing, good enough for M1
- [ ] Held-Karp (≤15 stops) and nearest-neighbour + 2-opt (>15)
- [ ] Serpentine baseline — the report's comparison number
- [ ] Open path: entrance start, checkout end
- [ ] Frozen/chilled-last soft constraint
- [ ] Generic entries collapsed to primary placement before routing
- [ ] Route returned as ordered stops plus polyline
- [ ] Unit tests on hand-verified routes over the mock graph
- [ ] Property tests: starts at entrance, ends at checkout, every stop visited once, distance matches polyline, **Held-Karp ≤ 2-opt**, frozen stops in the final third

### Track E — Search

- [ ] `String.includes` over 50 mock products — good enough for M1, delete later
- [ ] FlexSearch with Finnish tokenizer; index **prebuilt at data-build time**
- [ ] Typo tolerance, search-as-you-type
- [ ] Alias table wired in
- [ ] Ranking biased toward primary placements and common products
- [ ] Generic resolution: category match → generic list entry
- [ ] Single-item lookup → map pin

### Track F — Frontend

- [ ] App shell, mobile layout, navigation
- [ ] List builder: add, remove, reorder, check off; Zustand + `localStorage`
- [ ] SVG map: shelf polygons, route polyline, numbered pins
- [ ] Three path states; animated current leg
- [ ] Auto-zoom to current leg, full-route toggle
- [ ] Check-off advances the map
- [ ] Trip summary: stops, distance, time
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

- [ ] Friday store run, every week from M1 — not a phase
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

`pnpm data:build` — takes scraper output, normalises it, validates it, writes
`data/build/`, and stamps a version. Generated artefacts are committed, so the
command that produces them must be reproducible and named. Run locally; CI verifies
rather than regenerates.

### Data budget and bundle tiering

**This is the one place where two stated design properties can contradict each other.**
Offline operation is a headline requirement (§2, §3), and offline means precaching the
catalogue onto a phone. A raw 30k-product scrape can run to tens of megabytes, and
precaching that over cellular is not something users complete. Unbudgeted, the feature
the architecture is built around is the feature that breaks first on a real device.

The catalogue is therefore **not one artefact**. It is split by what routing actually
needs, and the split is enforced in CI rather than left to discipline.

| Tier        | Contents                                                                              | Caching                                           | Budget (gzipped)      |
| ----------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------- |
| **Core**    | walk graph, floorplan, categories, primary placements, aliases, prebuilt search index | precached by the service worker; required offline | **3 MB, CI-enforced** |
| **Display** | full product records, secondary placements                                            | lazy, stale-while-revalidate, IndexedDB           | unbudgeted            |
| **Editor**  | map-editor assets                                                                     | not cached at all                                 | n/a                   |

Core is everything needed to search a query, resolve a list and compute a route. If
core is present, the app is fully functional offline. Display affects only how richly a
result renders, so its absence degrades in one narrow, explainable way (§11).

**Measure before optimising further.** `pnpm seed:synthetic` already produces a
deterministic 30k-product fixture; that is the tool for this. In Phase 1, run
`data:build` over it and record gzipped size per chunk. Every number above is a
starting budget to be confirmed or adjusted against that measurement, once, early.

**How core stays inside its budget:**

- Only fields the app reads are normalised at all (§6). Price, images and descriptions
  are dropped at the scraper, not filtered at load.
- Category ids are interned integers rather than strings.
- Primary placements ship as a flat `EAN → nodeId` map, separate from the richer
  `Placement` records.
- The search index carries names and aliases only, with the EAN as its sole payload.

**Escape hatches, in the order they should be reached for**, if measurement shows core
over budget:

1. Prune stopwords and shorten the tokenizer's n-gram range in the index.
2. Index at category granularity and linear-scan within the matched category. A few
   hundred rows is well inside the 100 ms search target.
3. Only then consider restricting SKU-level search to a common-product subset.

Shrink the index before shrinking the data, and shrink the data before weakening
offline. **Do not resolve this by dropping the offline requirement**: a network
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

`pnpm seed:synthetic` produces a deterministic 30k-product catalogue on a ~400-node
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
laptop:

- Search results under 100 ms
- Route computation under 500 ms for a 20-item list
- Map interaction at 60 fps while panning
- **Cold start to first usable search under 2 s**, warm cache, on that phone. This is
  the target the tiering and the prebuilt index exist to hit; 100 ms query latency is
  meaningless if the index takes eight seconds to become available.
- **Core tier under 3 MB gzipped**, enforced in CI rather than checked by hand

---

## 14b. Considered, Build If Time Allows

Possibilities rather than commitments. None blocks anything.

- **A11y assertion in CI** — `@axe-core/playwright` added to existing E2E flows, one
  line per test. Turns the Phase 6 accessibility bullet from an intention into
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
sitting in the same room), automated release tooling (tag two commits by hand).

---

## 15. CI / CD

**The repository is public.** This gives unlimited GitHub Actions minutes on Linux
runners, free Codecov, and doubles as a portfolio artefact. Nothing in the project
is sensitive: the scraped data is public product information and there are no
credentials.

Every tool below is free and open source. Total cost of this pipeline is zero.

The highest-value job here is **not** lint or unit tests. It is data validation,
because the worst failure mode is a route that confidently sends a user to a shelf
that does not exist, and no amount of React testing catches that.

### On every PR

- **Lint** — ESLint + Prettier `--check`, runs first, fails fast
- **Typecheck** — `tsc --noEmit` across all workspaces
- **Unit tests + coverage** — Vitest; **85% threshold on `packages/core` only**, no
  threshold on React components (enforcing it there just produces assertion-free
  render tests written to hit a number)
- **Build** — both `apps/web` and `apps/map-editor`
- **Codecov upload** — comments the coverage delta on the PR

### On PRs touching `data/` or `scraper/`

- Zod schema validation over every core and display chunk, `graph.json` included
- No duplicate EANs
- Referential integrity: every `placement.nodeId` exists in the graph
- Every product has at least one `isPrimary` placement
- **Graph connectivity**: all nodes reachable from the entrance, no orphans
- Edge sanity: no zero or negative weights, all edges bidirectional
- Unmatched shelf ID count below an agreed threshold — fails loudly rather than
  degrading silently
- **Core tier budget: gzipped total under 3 MB, failing the build if exceeded.** Not a
  warning. A warning gets merged. This is the check that keeps the offline requirement
  and the catalogue size from quietly diverging over six contributors and eight weeks.
- No display-tier field appears in a core-tier chunk (schema separation holds)

The connectivity check alone catches most map-editor mistakes in minutes, instead of
during the store walk.

### Routing invariants (property tests)

- Route starts at the entrance, ends at the checkout
- Every requested stop visited exactly once
- Reported distance matches the summed polyline length
- **Solver cross-check** — on lists of ≤10 stops, assert Held-Karp distance ≤ 2-opt
  distance. If the heuristic ever wins, one solver is broken. This also produces
  benchmark data for the report as a side effect.
- Frozen and chilled stops appear in the final third of the route

### E2E (Playwright, mobile viewport)

- **Core flow** — search "maito" → add to list → generate route → map renders with
  correct pin count → check off item → current leg advances
- **Single-item lookup** — search → result → map pin
- **Offline** — load app, set browser context offline, verify search and routing still
  work. Offline is a headline design decision, so it should be verified rather than
  assumed.
- **Share link** — encode list to URL, load in a fresh context, verify restoration

Keep E2E to these few flows. Large suites on a student timeline become a tax nobody
pays.

### Scheduled (weekly cron)

- Run the scraper, diff against the committed bundle
- **Auto-open a GitHub issue** if placements moved, products disappeared, or new shelf
  IDs appeared
- Re-run manually before the demo regardless of schedule

This converts "the store rearranged and we found out on stage" into a notification.

### On merge to `main`

- Deploy `apps/web` to Netlify/Vercel production
- `apps/map-editor` deployed separately or kept local-only

### Repository configuration

- **Branch protection on `main`** — lint, typecheck, unit tests and build must pass
  before merge. With six people, this is the mechanism that actually enforces the
  review requirement rather than relying on everyone remembering to ask.
- **One required review from someone who did not write the change**
- **Two reviews on `packages/core` type changes**, since they ripple into everyone's
  work in progress. This is the only exception, and it is a CI check rather than
  CODEOWNERS, since there are no fixed owners
- **Path filters** — map-editor changes skip E2E, data changes skip the frontend build,
  `docs/` changes run lint only
- **`.claude/rules.md` changes are reviewed by that week's release captain**, and only
  alongside a decision recorded in §17
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

| Risk                                                  | Impact                                                                    | Mitigation                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Map editor slips**                                  | Blocks all mapping, blocks everything downstream                          | Ship an ugly version by week 2; polish later. Department-level graph by hand in week 1 so nothing waits on it                         |
| **Mapping takes longer than estimated**               | Critical path                                                             | It is a full-time role; schematic fidelity, not measured                                                                              |
| **Shelf IDs do not match reality**                    | Routes send users to the wrong place                                      | Verification walk; log unmatched IDs loudly                                                                                           |
| **Finnish search underperforms**                      | Users cannot find items                                                   | Alias table; test with real shopping lists early                                                                                      |
| **Integration reveals schema drift**                  | Late rework                                                               | Contract sprint up front; full integration week budgeted                                                                              |
| **Store rearranges mid-project**                      | Data goes stale                                                           | Diffing script; re-scrape before the demo                                                                                             |
| **No fixed roles means nobody owns the tedious work** | Bulk map tracing and the alias table stall; work is duplicated or dropped | One name per card while in flight, WIP limit of two, unclaimed cards raised at standup; rotating release captain owns board triage    |
| **Core bundle outgrows its budget**                   | Offline install fails on real phones; the headline feature dies quietly   | Measure in Phase 1 before anyone builds against the bundle shape; CI gate that fails rather than warns; escape hatches ordered in §14 |

**The two highest-risk items are the map editor and the in-store validation run.**
Start the map early, and book the store visit well before the deadline so there is
time to fix what it reveals.

---

## 17. Decisions Made

| Question                                   | Decision                                                                                  | Why                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic vs SKU list entries                | **Both, generic by default**; generic collapses to primary placement before routing       | Matches how people write lists; avoids the generalised TSP in the MVP                                                                                                   |
| Serpentine vs TSP                          | **TSP default**, serpentine implemented as benchmark and fallback toggle                  | TSP is the graded substance; the baseline turns a claim into a measured result                                                                                          |
| Supabase for shared lists                  | **No backend.** Sharing via URL-encoded list state                                        | Accounts and sync add risk and weaken offline, and demonstrate nothing the course assesses                                                                              |
| Floorplan fidelity                         | **Schematic throughout**, edge weights from pace counting                                 | Routes depend on topology and relative distance, not absolute geometry                                                                                                  |
| Team structure                             | **No fixed roles.** Ownership per task, WIP limit of two, rotating weekly release captain | Six people who each understand one sixth of the system cannot review each other's work or write the report; specialisation is allowed to emerge rather than be assigned |
| Repo visibility                            | **Public**                                                                                | Unlimited Actions minutes, free Codecov, portfolio value; nothing sensitive in the repo                                                                                 |
| Catalogue delivery                         | **Tiered**: budgeted core precached, display lazy via IndexedDB                           | A single unbudgeted bundle makes offline, the headline feature, the first thing to break on a real phone                                                                |
| Drop the offline requirement to solve size | **Rejected**                                                                              | Fails inside the building the app exists for, and turns a one-time download into a per-session one; it also removes the justification for the whole no-backend design   |
| Search index construction                  | **Prebuilt at data-build time**, shipped as an asset                                      | Index build at startup, not query latency, is what misses the target at 30k products on an old phone                                                                    |
| Server-side database for the catalogue     | **No** (client-side IndexedDB instead)                                                    | A backend reintroduces latency, deploy dependency and the loss of offline search, and demonstrates nothing the course assesses                                          |
| Route shape                                | **Split into legs** on each `RouteStop`; no single polyline                               | Map needs per-leg greying, highlighting and auto-zoom                                                                                                                   |
| Graph format                               | `{ version, nodes, edges, shelves }`, edges stored once, shelves as data                  | One format for editor, router and CI; shelves must be clickable and matchable                                                                                           |
| Coordinates                                | **Metres**, origin top-left, y down                                                       | Edge weights can default to geometric distance; no unit conversions                                                                                                     |
| List items                                 | `id` + `quantity` on every `ListItem`                                                     | Stable identity for reorder, check-off and React keys                                                                                                                   |
| Rendering code                             | Pure geometry in `core`, React SVG in `map-render`                                        | `core` stays framework-free                                                                                                                                             |
| Graph source                               | `data/graph/` per section; merged into `data/build/core/graph.json`                       | Parallel mapping without conflicts; hand-edited and generated files kept apart                                                                                          |

### Documented as future work, not as oversights

- **Generalised TSP** — allowing generic entries to be satisfied at any of several
  candidate nodes, rather than the primary placement only
- **Server-backed shared household lists** — only if the app sees real use after
  submission
- **Measured floorplan** — if a later version needs accurate distance display

### Still open

- Stride length calibration for pace counting (measure per person, or agree one value)
- Whether the route-mode toggle is user-visible or a developer flag
- How many test lists the benchmark uses, and how they are generated
