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

`scraper/export-kupittaa.ts` exports every product in K-Citymarket Turku Kupittaa (store `N119`) with its name, price and in-store location (department, shelf, level). It reuses the browser session from [p18a/mcp-k-ruoka](https://github.com/p18a/mcp-k-ruoka), which is cloned next to this repo rather than copied in, because that repo has no licence. Background and caveats: `docs/ARCHITECTURE.md` §7.

**Setup, every command and variable, output files and troubleshooting: [`scraper/README.md`](scraper/README.md).** The most common commands, from the repo root:

```bash
bun run scraper/export-kupittaa.ts collect   # list every product: EAN, name, brand, price (~25 min)
bun run scraper/export-kupittaa.ts scrape    # fetch each product's location (~18 h, resumable)
bun run scraper/export-kupittaa.ts status    # progress counts, no network
```
