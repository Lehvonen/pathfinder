# pathfinder

| What you're writing                       | Where it goes                    |
| ----------------------------------------- | -------------------------------- |
| Routing, TSP, shared types, pure geometry | `packages/core/src/`             |
| React SVG components shared by both apps  | `packages/map-render/` (planned) |
| The shopping app                          | `apps/web/src/`                  |
| The map editor (internal tool)            | `apps/map-editor/src/`           |
| Scraper (TypeScript, run with Bun)        | `scraper/`                       |
| Data build / validation scripts           | `scripts/`                       |
| Hand-made fixtures                        | `data/mock/`                     |
| Implementation plans, one per feature     | `docs/plans/`                    |

Rule of thumb: pure logic with no React goes in `packages/core`. React code that both apps need goes in `packages/map-render`.

## Setup

Install Git for Windows, Node 22 LTS, **pnpm 10** and VS Code. Then:

```bash
git clone https://github.com/Lehvonen/pathfinder.git
cd pathfinder
pnpm install
cp .env.example .env
```

On Windows, use the **Git Bash** terminal, and keep the repo **outside OneDrive** (e.g. `C:\dev`).

## Before you push

Run what CI runs. If this passes locally, CI will almost certainly pass too:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All commands below are run from the repo root.

### Formatting (Prettier)

| Command                                      | What it does                                                |
| -------------------------------------------- | ----------------------------------------------------------- |
| `pnpm format`                                | Fixes formatting in every file                              |
| `pnpm exec prettier --check .`               | Only checks: lists files that would change, changes nothing |
| `pnpm exec prettier --write path/to/file.ts` | Fixes one file                                              |

### Linting (ESLint)

| Command                         | What it does                                         |
| ------------------------------- | ---------------------------------------------------- |
| `pnpm lint`                     | ESLint plus the Prettier check. This is what CI runs |
| `pnpm exec eslint .`            | ESLint only                                          |
| `pnpm exec eslint . --fix`      | ESLint, auto-fixing what it can                      |
| `pnpm exec eslint apps/web/src` | Lints one folder                                     |

### Type checking

| Command                                          | What it does    |
| ------------------------------------------------ | --------------- |
| `pnpm typecheck`                                 | All packages    |
| `pnpm --filter @pathfinder/core typecheck`       | Core only       |
| `pnpm --filter @pathfinder/web typecheck`        | Web app only    |
| `pnpm --filter @pathfinder/map-editor typecheck` | Map editor only |
| `pnpm --filter @pathfinder/scraper typecheck`    | Scraper only    |

### Tests

| Command                                                               | What it does                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm test`                                                           | All tests, with coverage. This is what CI runs             |
| `pnpm --filter @pathfinder/core test`                                 | Core tests with coverage                                   |
| `pnpm --filter @pathfinder/core exec vitest`                          | Watch mode: reruns when you save a file. Press `q` to quit |
| `pnpm --filter @pathfinder/core exec vitest run src/geometry.test.ts` | One test file                                              |
| `pnpm --filter @pathfinder/core exec vitest run -t "sums"`            | Only tests whose name contains "sums"                      |

### Coverage

| Command                                               | What it does                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @pathfinder/core test`                 | Prints the coverage table and fails if any number is under 85%                     |
| `start packages/core/coverage/lcov-report/index.html` | Opens the HTML report after a test run. Click a file to see uncovered lines in red |

On macOS use `open` instead of `start`.

### Build and run

| Command                                    | What it does                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm build`                               | Builds both apps                                                                 |
| `pnpm --filter @pathfinder/web dev`        | Dev server for the shopping app, with live reload                                |
| `pnpm --filter @pathfinder/map-editor dev` | Dev server for the map editor                                                    |
| `pnpm --filter @pathfinder/web preview`    | Serves the built web app, closest to what Netlify serves. Run `pnpm build` first |

## Scraper

`scraper/export-kupittaa.ts` exports every product in K-Citymarket Turku Kupittaa (store `N119`) with its name, price and in-store location (department, shelf, level). It reuses the browser session from [p18a/mcp-k-ruoka](https://github.com/p18a/mcp-k-ruoka), which is cloned next to this repo rather than copied in, because that repo has no licence. Background and caveats: `docs/ARCHITECTURE.md` §7. **Full guide: [`scraper/README.md`](scraper/README.md).**

### One-time setup

```bash
npm i -g bun
git clone https://github.com/p18a/mcp-k-ruoka.git C:/dev/mcp-k-ruoka
cd C:/dev/mcp-k-ruoka && bun install && bunx playwright install chromium
```

If you clone it somewhere else, set `MCP_K_RUOKA_DIR` to that folder when running the scraper.

### Running it

Run from the repo root. It works in two phases:

1. **`collect`** lists every product with its **EAN, name, brand and price**, 100 per request. About 450 requests, roughly 10 minutes.
2. **`scrape`** fetches each product's **location** (department, shelf, level). The listing does not include it, so this is one request per product: about 18 hours for all ~44k, which is why `LIMIT` exists.

`csv` merges both into `kupittaa.csv` at any point. Location columns stay empty for products phase 2 has not reached yet.

| Command                                             | What it does                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `bun run scraper/export-kupittaa.ts collect`        | Phase 1: EAN, name, brand and price for every product (~10 min)           |
| `bun run scraper/export-kupittaa.ts csv`            | Writes `kupittaa.csv` from what has been fetched so far. No network       |
| `LIMIT=2000 bun run scraper/export-kupittaa.ts`     | Phase 1, then locations for the 2,000 most popular products, then the CSV |
| `bun run scraper/export-kupittaa.ts`                | Full run: phase 1, every product's location (~18 h), then the CSV         |
| `bun run scraper/export-kupittaa.ts scrape`         | Phase 2 only: locations for listed products not fetched yet               |
| `bun run scraper/export-kupittaa.ts status`         | Progress counts. No network                                               |
| `pnpm --filter @pathfinder/scraper export:kupittaa` | Same as the full run, through pnpm                                        |

| Variable          | Default              | What it does                            |
| ----------------- | -------------------- | --------------------------------------- |
| `DELAY_MS`        | `1500`               | Pause between requests, in milliseconds |
| `LIMIT`           | none                 | Stop phase 2 after this many products   |
| `MCP_K_RUOKA_DIR` | `C:/dev/mcp-k-ruoka` | Where the mcp-k-ruoka clone is          |

### Output

Everything goes to `scraper/cache/kupittaa/`, which is gitignored:

- `kupittaa.csv`: one row per product, `ean;name;brand;price;unit_price;department;shelf;level;zone;department_order`. Semicolons and decimal commas, so Excel with Finnish settings opens it in columns
- `queue.json`: every product found in the listing (EAN, name, brand, price, URL slug, popularity, category)
- `products.ndjson`: one line per product whose location has been fetched, for example (shortened)

```json
{
  "ean": "6410405082657",
  "name": "Pirkka suomalainen kevytmaito 1l",
  "price": { "price": 0.89, "unit": "kpl" },
  "location": {
    "shelf": "05",
    "level": "1",
    "department": {
      "name": "(MAITO) Maidot ja piimät - KORVAA ITSE",
      "orderNumber": 68,
      "zone": "KERÄILY"
    }
  }
}
```

### Stopping and resuming

Progress is saved after every request. Press `Ctrl+C` at any time and run the same command again to continue where it left off.

The scraper sends one request at a time and **stops by itself** on HTTP 401, 403, 429 or 503, on an HTML response, or if a response is for a store other than Kupittaa. It never retries around a block. If it stops, wait, then rerun with a longer delay, for example `DELAY_MS=3000 bun run scraper/export-kupittaa.ts`.

To start over from scratch, delete `scraper/cache/kupittaa/`.
