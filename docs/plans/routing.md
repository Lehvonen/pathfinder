# Plan: routing

**Status:** PR 1 (data) merged (#26). PR 2 (engine) built and reviewed; PR 3 (web) after it.
**A rough draft, not a source of truth**: the shortest route over a rough map. Where this file
and the code disagree, the code wins.
**Architecture refs:** §6 (generic entries, `CategoryPlacement`), §7 step 3 (shelf matching),
§8 (walk graph, dead ends), §9 (routing engine), §11 (route mode, trip summary), §14 (core
budget), §17 (decisions)
**Covers checklist items:** Track B shelf matching and the `CategoryPlacement` draft (done);
Track D: Dijkstra, dead ends, Held-Karp and 2-opt, open path, generic entries, the `Route`
shape, unit tests; Track F: "Laske reitti" does something. Not the map, the aisle-order
baseline or frozen-last (§7 below)

"Laske reitti" takes the shopping list and gives the **shortest walk from an entrance,
past every item, to a checkout**, shown as numbered stops with the distance and time. Every
product and every generic entry can be routed, because the department-level map (§8) has a
place for each. Distances are only as good as that map: rough aisles, placeholder scale.

## 1. Three stacked PRs

| PR  | Branch           | What                                                                    |
| --- | ---------------- | ----------------------------------------------------------------------- |
| 1   | `routing/data`   | Routing data for the browser, `pnpm data:routing` (§2). **Merged, #26** |
| 2   | `routing/engine` | `dijkstra.ts`, `tsp.ts`, `route.ts` in `packages/core` (§3)             |
| 3   | `routing/web`    | Load the data, compute on "Laske reitti", show the stops (§4)           |

## 2. Data (PR 1, done)

`pnpm data:routing` (`scripts/build-routing.ts`, helpers in `@pathfinder/core/build`) checks
the map and the catalogue, then writes to `data/build/core/`:

| File                       | Gzipped | Contents                                                     |
| -------------------------- | ------- | ------------------------------------------------------------ |
| `graph.json`               | 5 KB    | The walk graph: 181 nodes, 250 edges, 198 department shelves |
| `placements-primary.json`  | 216 KB  | EAN → `{ nodeId, categoryId }`, every product                |
| `category-placements.json` | 3 KB    | `categoryId → nodeId`, every category                        |
| `areas.json`               | 2 KB    | The map's areas, for stop names and the map view             |

- **Shelf fallback:** a shelf id the graph does not list goes to its department's `:00`
  shelf. 2026-10-04 scrape: 39,479 placed, 20,526 through the fallback, none unmatched. An
  unmatched shelf stops the build.
- **Generic entries, generated:** each category goes to the node holding most products of it
  and its subcategories, until `CategoryPlacement` is hand-maintained (§6). A category spread
  over several areas always goes to one.
- **Budget:** fails above 512 KB gzipped, the routing share of the 3 MB core (§14).

## 3. Engine (PR 2)

All in `packages/core`, framework-free, unit-tested on small hand-made graphs.

1. **Resolve the list** (`route.ts`). A product goes to its node through
   `placements-primary.json`; a generic entry through `category-placements.json`. Items at
   the same node are **one stop**. An item with no node, or one no entrance or no checkout
   can be reached from, is returned as **unplaced**, beside the route, so `types.ts` does
   not change. Checked items are left out.
2. **Shortest paths** (`dijkstra.ts`). Edges are walkable both ways. **Shelf-access,
   checkout and entrance nodes are dead ends**: a path may start or end at one but never pass
   through it, since a block's centre node joins the aisles on its sides (§8). Run once from
   each stop and each entrance, over the whole graph (181 nodes, instant), keeping the
   distance and the path to every stop and checkout.
3. **Order the stops** (`tsp.ts`), an open path from a fixed start:
   - **≤ 15 stops: Held-Karp**, the exact shortest order. 17 ms at 15 stops on a PC.
   - **> 15 stops: nearest-neighbour, then 2-opt.** Not always close: measured at 15 stops
     on the map (300 lists), 4 % longer than the shortest on average, 12 % for one list in
     ten, up to about 30 %. Rare in practice, since the map has 42 places to stop.
   - **The checkout is chosen, not fixed:** the cost of ending after a stop is its distance
     to the nearest checkout, so the order and the checkout are optimised together.
   - **Every entrance that reaches all the stops is tried**; the shortest route wins. An
     entrance joined to nothing is skipped.
   - **A split map is an error:** if two stops can't reach each other, or no one entrance
     reaches them all, `planRoute` throws a map error rather than leave a stop out. Neither
     ever returns a partial order.
4. **Build the `Route`** (the contract's type): the entrance, the stops in order (`order`
   1..n), each with the leg that reaches it as points, the checkout with its final leg, the
   total distance, and the minutes.
5. **Minutes, rough:** walking at 1 m/s plus 20 s per stop. On a placeholder scale this is
   an order of magnitude, not a promise.

**Commits:** this plan; `dijkstra.ts` + test; `tsp.ts` + test (Held-Karp never longer than
2-opt); `route.ts` + test; the `index.ts` exports. Then fixes from the review: no partial
orders and tests at 15 and 16 stops; a test that entrances are dead ends; usable entrances
only, the split-map error and two-checkout tests; these docs.

## 4. Web (PR 3)

- **Load** `graph.json`, `placements-primary.json`, `category-placements.json` and
  `areas.json` like the search files (`?url`, content-hashed).
- **"Laske reitti"** computes the route from the list as it is then. Changing the list
  afterwards does not move the route; pressing the button again does.
- **Route page:** numbered stops, each with its area name and its items with amounts; total
  metres and minutes; unplaced items listed; a "Takaisin" button. The list panel stays.
- **No map yet.** Drawing the route is the step after this.

## 5. Decisions, for now

| Question                     | Decision                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| Exact or heuristic order     | **Held-Karp up to 15 stops**, nearest-neighbour + 2-opt above     |
| Which entrance, which till   | **Every entrance reaching all stops tried; checkout with order**  |
| A split map                  | **A map error, thrown**; never a route with a stop left out       |
| Items in the same department | **One stop**                                                      |
| Generic entries              | **Generated category placements** until a hand-made table exists  |
| An item with no node         | **Listed as unplaced**, never dropped silently, route still drawn |
| Minutes                      | **1 m/s plus 20 s per stop**, rough                               |

## 6. Known gaps

From the PR #26 review, not fixed yet:

- `build-routing.ts` imports `stableJson` from `@pathfinder/search/build`, and copies about
  40 lines of helpers from `build-search.ts`. Share them when `data:build` exists.
- `areas.json` ships the map's source URL and scale, which the app does not read.
- One `category-placements` test checks two things; one condition there can never be false.
- The `types.ts` comment on `CategoryPlacement` still says "hand-maintained"; left until the
  table is, since `types.ts` changes need two reviewers.

From the PR 2 review, not fixed yet:

- **No connectivity check that respects dead ends** in `pnpm data:routing`: the graph check
  walks through dead ends, so a split map is caught only when a route is planned. Add it to
  the build (ARCHITECTURE.md §15 plans graph connectivity in CI).
- **Nearest-neighbour + 2-opt can be 30 % off** (§3). Or-opt moves, or 2-opt from every
  first stop, would close most of it; cheap at 42 places.
- The test helpers `node` and `edge` are written out in both `dijkstra.test.ts` and
  `route.test.ts`.

## 7. Not now

- **Frozen and chilled last** (§9 step 4): the categories carry a temperature already.
- **Aisle-order (serpentine) baseline** and the TSP-vs-serpentine comparison for the report.
- **Property tests** (§15): start at the entrance, end at a checkout, every stop once.
- **The map view** (§11): legs, numbered pins, the current leg.
