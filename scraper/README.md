# Kupittaa scraper

`export-kupittaa.ts` exports every product in **K-Citymarket Turku Kupittaa** (store `N119`): EAN, name, brand, price and in-store location (department, shelf, level). The output lands in `scraper/cache/kupittaa/`, which is gitignored.

It reuses the browser session from [p18a/mcp-k-ruoka](https://github.com/p18a/mcp-k-ruoka). That repo is cloned next to this one and loaded at runtime, not copied in, because it has no licence. Background and caveats: `docs/ARCHITECTURE.md` §7.

## Setup (once per machine)

```bash
npm i -g bun
git clone https://github.com/p18a/mcp-k-ruoka.git C:/dev/mcp-k-ruoka
cd C:/dev/mcp-k-ruoka && bun install && bunx playwright install chromium
```

Cloned somewhere else? Set `MCP_K_RUOKA_DIR` to that folder when you run the scraper.

## How it works

It runs in two phases:

1. **Listing (`collect`)**: pages through the store, 100 products per request, saving **EAN, name, brand and price**. Several hundred requests, roughly **25 minutes**: large listings are split into categories, because K-Ruoka pages only about 1,000 products per listing.
2. **Locations (`scrape`)**: the listing has no shelf data, so this fetches each product's **department, shelf and level** one request at a time. About 44k products at 1.5 s each, roughly **18 hours**. Most popular products go first.

`csv` merges both into a spreadsheet at any point.

## Commands

Run from the repo root (`C:\dev\pathfinder`).

| Command                                                             | What it does                                                                                           | When to use it                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `bun run scraper/export-kupittaa.ts`                                | Full run: listing, then every location, then the CSV                                                   | The normal 18-hour run, e.g. overnight                                      |
| `bun run scraper/export-kupittaa.ts collect`                        | Listing only: EAN, name, brand and price for every product (~25 min)                                   | You need the catalogue and prices, not locations, or want to refresh prices |
| `bun run scraper/export-kupittaa.ts scrape`                         | Locations only, for listed products not fetched yet. Skips the listing                                 | Resuming after an interruption                                              |
| `bun run scraper/export-kupittaa.ts csv`                            | Writes `kupittaa.csv` from everything fetched so far. No network                                       | Any time you want a spreadsheet, even mid-run                               |
| `bun run scraper/export-kupittaa.ts status`                         | Counts: listed, fetched, with location, without, errors. No network                                    | Checking progress                                                           |
| `bun run scraper/normalise.ts`                                      | Cleans the scrape into `data/normalised/`, see [Cleaning the scrape](#cleaning-the-scrape). No network | After a scrape. Also `pnpm --filter @pathfinder/scraper normalise`          |
| `EXTRA_CATEGORIES=a/b,c/d bun run scraper/export-kupittaa.ts extra` | Lists only the given categories, adds new products to the queue, then writes the CSV                   | Filling the gaps a `⚠ … subcategories cover X of Y` warning points at       |
| `LIMIT=20 bun run scraper/export-kupittaa.ts`                       | Listing, then locations for the 20 most popular products only                                          | First run: check the output looks right before the long run                 |
| `LIMIT=2000 bun run scraper/export-kupittaa.ts`                     | Listing, then locations for the 2,000 most popular (~1 h)                                              | Covering what most shopping lists contain without waiting 18 h              |
| `pnpm --filter @pathfinder/scraper export:kupittaa`                 | Same as the full run, through pnpm                                                                     | If you prefer pnpm scripts                                                  |

Settings go in front of the command, e.g. `DELAY_MS=3000 LIMIT=500 bun run scraper/export-kupittaa.ts`:

| Variable           | Default              | What it does                                                                                                      |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DELAY_MS`         | `1500`               | Pause between requests, in milliseconds                                                                           |
| `LIMIT`            | none                 | Stop the location phase after this many products                                                                  |
| `EXTRA_CATEGORIES` | none                 | Comma-separated category paths to list as well, copied from the k-ruoka.fi address bar after `/kauppa/tuotehaku/` |
| `MCP_K_RUOKA_DIR`  | `C:/dev/mcp-k-ruoka` | Where the mcp-k-ruoka clone is                                                                                    |

## Interruptions: nothing is lost

The scraper **writes as it goes**:

- `queue.json` is saved after every page of the listing.
- Each product is added to `products.ndjson` the moment its location is fetched.

If it stops after 6 hours, those 6 hours (~14,000 products) are kept. Rerun and it carries on with the next product:

| Situation                                 | Command                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Closed it, crashed, PC restarted or slept | `bun run scraper/export-kupittaa.ts scrape`                                  |
| Same, but refresh names and prices first  | `bun run scraper/export-kupittaa.ts` (adds ~25 min)                          |
| It stopped itself on a block (403, 429)   | Wait a while, then `DELAY_MS=3000 bun run scraper/export-kupittaa.ts scrape` |
| Start completely over                     | Delete `scraper/cache/kupittaa/`, then run again                             |

A run killed mid-write can leave a half-written last line. It is skipped with a warning and that one product is fetched again. `Ctrl+C` is always safe.

Windows sleep pauses the run, so set the PC not to sleep while plugged in for the long run.

## Built-in safety stops

One request at a time, with `DELAY_MS` between them. The scraper **stops by itself**, without retrying, on:

- HTTP 401, 403, 429 or 503
- an HTML page instead of JSON (usually a Cloudflare check)
- a listing response for a store other than Kupittaa. In the location phase such a product is saved as an error record and skipped instead, so a rerun can get past it

Progress is saved, so just rerun later.

## Output files

All in `scraper/cache/kupittaa/`:

| File                  | Contents                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kupittaa.csv`        | One row per product: `ean;name;brand;price;unit_price;department;shelf;level;zone;department_order;popularity;popularity_rank`. Semicolons and decimal commas, so Excel with Finnish settings opens it in columns. Location columns are empty until the location phase reaches that product |
| `queue.json`          | Every product from the listing: EAN, name, brand, price, unit price, URL slug, popularity, category                                                                                                                                                                                         |
| `category-names.json` | Category path → Finnish name, collected from the listing (`collect` and `extra`). The cleaner names categories with it                                                                                                                                                                      |
| `products.ndjson`     | One JSON line per product whose location has been fetched, or an error record (counted as errors in `status`)                                                                                                                                                                               |

Example `products.ndjson` line (shortened):

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

Good to know about the data:

- **Shelf numbers are per store.** The same milk is shelf 05 in Kupittaa and shelf 31 in Iso Omena.
- **`department_order`** looks like the store's own walking order (coffee 12, milk 68). It could be useful for routing, but that is not confirmed.
- **`popularity`** is K-Ruoka's own score (undocumented, higher = more popular). **`popularity_rank`** is 1 for the most popular; ties share a rank, so the many products scored 0 all share the last rank.
- **Some department names are internal labels**, such as "KORVAA ITSE", not the text on the store's signs.
- **Shelf `00` / level `0` means "department only".** Common outside groceries (cosmetics, books, leisure): the store records the department but no shelf. Route to the department, not a shelf.
- **No location at all is expected for some products.** These are typically web-shop items such as clothing or sports gear, and k-ruoka.fi shows no store location for them either (checked by hand). They are not scraper errors.

## Cleaning the scrape

`scraper/normalise.ts` turns the scrape into the records the app is built from, shaped like `packages/core/src/types.ts`, and writes them to `data/normalised/` (committed). The rules and the reasoning are in `docs/plans/normalise.md`.

```bash
bun run scraper/normalise.ts
```

It reads `queue.json`, `products.ndjson` and `category-names.json` from the cache, plus two files in `data/curation/` that people maintain:

| File                             | What it is                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `data/curation/departments.json` | One row per store department: what kind it is and how cold. Reviewed by hand, see below           |
| `data/curation/categories.json`  | Optional. `category path → ambient / chilled / frozen`, for categories whose vote comes out wrong |

Every input is checked first. A typo such as `"kind": "junkk"` or broken JSON stops the run with the file and the problem, before anything is written.

### Reviewing the department table

The first run, and any run after a scrape that finds a new department, adds guessed rows to `data/curation/departments.json` and **stops**:

```
202 departments in data/curation/departments.json are unreviewed. …
```

Nothing is written to `data/normalised/` until every row is reviewed. `data/normalised/report.md` is still written, with product counts per department to help. For each row:

```json
{
  "id": "91208",
  "name": "(MAITO) Maidot ja piimät - KORVAA ITSE",
  "kind": "aisle",
  "temperature": "chilled",
  "reviewed": false
}
```

- **`kind`**: `aisle`, `counter` (service counters, e.g. PTISKI), `backroom` or `junk`. Products in `backroom` and `junk` departments are left out: these are staff notes such as "JÄTÄ SUORAAN PUUTTEEKSI!" or pickup codes, not places a shopper can go
- **`temperature`**: `ambient`, `chilled` or `frozen`. It decides frozen-last routing for the department's categories
- **`label`** (optional): a signage-style name when the K-Ruoka name is an internal label, e.g. `"Maidot ja piimät"`
- **Delete `"reviewed": false`** once the row is checked
- **Don't edit `name`**: it is K-Ruoka's name, refreshed from every scrape so you can tell what the row is

Run it again when every row is reviewed. Your decisions are kept on every later run; only `name` is refreshed, and a department that disappears from a scrape stays in the table.

### Output

All in `data/normalised/`, one record per line so a re-scrape shows up in git diffs product by product:

| File                | Contents                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `products.json`     | Every product the app knows: EAN, name, brand, category id                                             |
| `placements.json`   | Where each product is: shelf id `<department id>:<shelf>`, shelf level. `:00` means department only    |
| `categories.json`   | The category tree with Finnish names and temperatures                                                  |
| `category-ids.json` | Category path → id. **Append-only**: saved shopping lists store these ids, so never renumber or delete |
| `popularity.json`   | EAN → K-Ruoka popularity, `null` for unranked. Used at build time only                                 |
| `departments.json`  | The reviewed department table plus each department's shelves and product count, for the map work       |
| `report.md`         | What was left out and why, departments to review, mixed-temperature categories. Read it after each run |

Products with no store location (web-shop items) and unavailable products (shopping bags) are left out; `report.md` lists them by reason.

## Troubleshooting

| Message                                                  | Fix                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-k-ruoka not found at …`                             | Do the setup above, or set `MCP_K_RUOKA_DIR`                                                                                                                        |
| `HTTP 403/429 …`                                         | The site is refusing or rate-limiting. Wait, then rerun with a larger `DELAY_MS`                                                                                    |
| `Got text/html instead of JSON`                          | Cloudflare check. Wait and rerun                                                                                                                                    |
| `The unfiltered listing returned no products`            | K-Ruoka changed its listing request. Compare it in DevTools with `listPath()` in the script                                                                         |
| `… more than K-Ruoka pages; splitting into N categories` | Normal. K-Ruoka only pages about 1,000 products per listing, so big listings are fetched category by category                                                       |
| `⚠ X: subcategories cover N of M`                        | Some subcategories of X were never seen. Open X on k-ruoka.fi, find the subcategories not in the log, and list them with `EXTRA_CATEGORIES` and the `extra` command |
| `⚠ N products missing`                                   | Over 5% of the store was not listed. Fix the subcategory warnings above the same way                                                                                |
| Red errors in VS Code                                    | Run `pnpm install`, then "TypeScript: Restart TS Server"                                                                                                            |

Typecheck: `pnpm --filter @pathfinder/scraper typecheck`.
