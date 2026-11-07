# Plan: the list and purchase history, kept on the device

**Status:** PR 2 (the list survives a refresh) merged (#33); PR 3 (history, suggestions) built.
**A rough draft, not a source of truth**: written before the code, to agree the shape. Where
this file and the code disagree, the code wins.
**Architecture refs:** §2 (scope), §11 (list builder), §17 (no backend)
**Covers checklist items:** Track F "The list survives a refresh" and "Purchase history and
suggestions"

Two things are kept in the browser, and nothing is sent anywhere:

1. **The shopping list**, so that **refreshing the page does not empty it**.
2. **Purchase history, only if the shopper says yes**: what was picked on each finished
   shop, used to suggest things on the search screen.

There is still no backend and no accounts (ARCHITECTURE §17). The data lives only on the
shopper's phone.

## 1. What is stored

| Key                            | What                                                        | Written                                 | Consent                       |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| `pathfinder.list.v1`           | `{ savedAt, entries }`: the list (item and name), ticks too | After every change to the list          | None: strictly necessary (§5) |
| `pathfinder.history.v1`        | Finished trips: the day and the picked items (§3)           | On "Valmis", only if the shopper agreed | **Opt-in**, off by default    |
| `pathfinder.historyConsent.v1` | `"yes"` or `"no"`; no key means the offer was not answered  | When the offer is answered or withdrawn | None: it is the answer itself |

- **`localStorage`, not IndexedDB.** The data is small (a trip is about 2 KB, 50 trips about
  100 KB), and `localStorage` reads synchronously, so the list is there on the first paint
  with no empty flash. IndexedDB stays for the display tier (ARCHITECTURE §11 Offline).
- **The version is in the key.** A later format gets a new key. Loading only ever reads: an
  old key is read and converted if worth it, and **removed by the next save**, never while
  loading (React calls the loader twice in development, `StrictMode`).
- **Never trusted on read.** Anything that does not have the expected shape is dropped, row
  by row, never thrown (§2). The list and the history share **one row checker**.
- **Storage can fail.** Private browsing, blocked site data or a full quota make reads and
  writes throw. Every access is in `try`/`catch`; the app then works as it does today, in
  memory only, with no error shown.

## 2. The list survives a refresh (PR 2)

- **Loaded once on start**, as the reducer's initial state (`useReducer`'s lazy init), so
  the first render already shows the saved list. `loadList` has no side effects.
- **Saved after every change**, from an effect on the list, with `savedAt` (the time, in
  ms). The effect's first run, on start, writes the checked list back: rows dropped on read
  are gone for good, which is intended, since they could not be used. "Valmis" clears the
  list; an empty list removes the key.
- **Ticks are kept** for a refresh in the middle of a shop. Ticked items are left out of the
  next route (`planRoute`), so "Laske reitti" → "Aloita ostokset" carries on where the
  shopper was.
- **Stale ticks are cleared.** If the list was not saved for **12 hours**, every item is
  unticked on load. It is saved on every change and every start, so this is 12 hours with
  the app unused, not the age of each tick. A shopper who paid and closed the app without "Valmis" would otherwise
  find those items silently missing from next week's route. No shop lasts 12 hours.
- **After a refresh the app opens on search**, with the list. The screen, the planned route
  and the trip (its start time) are not saved (§8).
- **Checked row by row on read** (`readItem`, shared with the history). A row is **rebuilt
  from its known fields only**, so unknown keys are never written back:
  - a product: `ean` a non-empty string; a generic entry: `categoryId` a number and `label`
    a non-empty string (a string `categoryId` would make the item silently unplaced);
  - `name` a non-empty string;
  - `quantity` a number, pulled into 1–99 (`clampQuantity`);
  - `checked` a boolean, anything else unticked;
  - missing or repeated `id`s get a new one from `newItemId()`.

  Anything else is dropped. **Two rows for the same thing** (`isSameThing`, exported from
  `listState.ts`) are merged into the first: amounts added, ticked only if both were. A
  product no longer in the catalogue (after a data update) is kept: routing puts it with the
  items it cannot place, as today.

## 3. Purchase history (PR 3)

- **Off by default.** The finish card asks: "Muistetaanko ostoksesi? Ehdotamme niitä
  seuraavalla kerralla. Tiedot pysyvät vain tällä laitteella." with **"Kyllä"** and **"Ei
  kiitos"**, equal in size and weight. "Kyllä" stores `"yes"` and this trip is recorded on
  "Valmis". "Ei kiitos" stores `"no"` and the shopper is not asked again. **Until it is
  answered**, the offer shows on every finish card, and a trip finished without an answer
  is not recorded. Once answered, the question turns into a short confirmation that takes
  focus; the buttons are hidden but keep their room, so "Valmis" never moves under a second
  tap.
- **What is recorded**, on "Valmis": **ticked items only**, the nearest the app gets to
  "bought". A history item is a `ListItem` without `id` and `checked`, plus the name shown:
  a product's EAN or a generic entry's category id and word, and the amount. The trip gets
  the **day** (`YYYY-MM-DD`, local time) and nothing else: no time, no route, no entrance.
- **When to record** is pure, tested logic in `history.ts`: only with consent `"yes"` and at
  least one item ticked.
- **Recording reads storage first**: the answer, then the history; append, trim, write. If
  another tab has said "no" since, nothing is saved and this tab follows. A tab left open for
  days never overwrites trips another tab recorded.
- **Kept small:** the newest **50 trips**, none older than **365 days**, trimmed on every
  write and **tidied on start**: without a "yes", any history left over is deleted; with
  one, it is written back trimmed, so a year-old trip leaves the device even when nothing
  new is recorded. Trips are only read with a "yes".
- **The controls are always reachable.** While consent is `"yes"`, the search screen with an
  empty search box shows **"Ostohistoria on päällä"** with **"Unohda ostohistoria"** and
  **"Älä muista"**, whether or not there are suggestions. "Unohda ostohistoria" deletes the
  history at once; recording carries on from the next trip. "Älä muista" deletes the history
  and stores `"no"`. One tap each, with no "are you sure". Each is announced politely
  ("Ostohistoria unohdettu…", "Ostohistoria poistettu…"). Focus moves to the status line
  after "Unohda ostohistoria" or a suggestion's "Lisää", and to that message after "Älä
  muista", since what was pressed is gone. Not to the search box: on a phone that opens the
  keyboard.

## 4. Suggestions (PR 3)

- **Where:** on the search screen while the search box is empty (`isEmptyQuery`, the rule
  `SearchResults` uses too), under the heading **"Usein ostamasi"**, above the history
  controls (§3). Shown only with consent `"yes"`.
- **Which:** things picked on **at least 2 trips**, so one-off buys are not suggested. Things
  already on the list are left out. At most **8**. With none to show, only the heading is
  left out; the controls stay.
- **Order:** each trip an item was picked on counts `0.5 ^ (age in days / 30)`, so a trip a
  month ago counts half as much as one today. Highest total first; ties go to the more
  recently picked. "The same thing" is the list's own rule, `isSameThing`.
- **Adding:** each suggestion has "Lisää", like a search result, which adds it with amount 1
  through the same path as search, so "Lisätty listalle: …" shows as usual.
- **Pure logic, unit-tested:** `suggestions(history, list, today)` in `ranking.ts`, in
  `apps/web/src/history/`, beside the list logic, not in `core`: it is about the list, which
  lives in the web app (like `listState.ts`).
- **Boundary tests:** 1 and 2 trips, 8 and 9 suggestions, 50 and 51 trips, 365 and 366 days,
  and a list 12 hours old and just over (§2).

## 5. Privacy

- **Nothing leaves the device.** No request carries the list or the history, and there are no
  analytics. A PR that sends either anywhere changes this plan and needs its own review.
- **GDPR.** The history is personal data, but it is kept and used only on the shopper's own
  device; the team never receives it. That keeps the exposure small, not zero.
- **ePrivacy (Article 5(3)).** Storing anything on the shopper's device, `localStorage`
  included, needs consent unless it is strictly necessary for a service the shopper asked
  for. **The list is** (like a shop's cart): no consent. **The history is not**: opt-in, off
  by default, and as easy to withdraw as to give, so the controls are never hidden (§3).
- **Minimal:** the day, not the time; ticked items only; capped at 50 trips and a year.
- **If it ever goes to a server** (sync, smarter suggestions): a legal basis, a privacy
  notice and a data-processing agreement are needed. Out of scope (ARCHITECTURE §2).
- **Not legal advice.** The offer's wording is checked by whoever handles data protection
  before the app is used by real shoppers.

## 6. Files

| PR  | File                                            | Role                                                                                   |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2   | `apps/web/src/list/listState.ts` + test         | Export `isSameThing`, for merging rows on read                                         |
| 2   | `apps/web/src/list/listStorage.ts` + test       | `loadList`, `saveList`, `readItem`: read and check the saved list, write it            |
| 2   | `apps/web/src/list/useSavedList.ts`             | The list reducer, started from the saved list and saved on every change                |
| 2   | `apps/web/src/App.tsx`                          | `useSavedList` in place of `useReducer`; its "in memory only" comment                  |
| 2   | `apps/web/src/route/routeView.ts`               | Reload comments, also in `useRoutingData.ts` and `shopping.css`                        |
| 2   | `docs/ARCHITECTURE.md`, `docs/plans/*.md`       | §11's current state, `list.md`, `route-map.md`, `routing.md`, this file                |
| 3   | `apps/web/src/list/listState.ts` + test         | `Thing`, so `isSameThing` takes history items too; `thingKey`, its key form            |
| 3   | `apps/web/src/list/storeStubs.ts`               | Fake storage for the tests, shared by the list and the history                         |
| 3   | `apps/web/src/list/listStorage.ts` + test       | `readNamedItem`, `isRecord`: the row check shared with the history                     |
| 3   | `apps/web/src/history/history.ts` + test        | Record a trip from the ticked items; when to record; trim to 50 trips and a year       |
| 3   | `apps/web/src/history/historyStorage.ts` + test | Load, record (read, append, trim, write) and forget; the consent answer                |
| 3   | `apps/web/src/search/emptyQuery.ts` + test      | `isEmptyQuery`, shared by search results and the suggestions                           |
| 3   | `apps/web/src/history/ranking.ts` + test        | The ranking in §4; not `suggestions.ts`, which Windows takes for `Suggestions.tsx`     |
| 3   | `apps/web/src/history/useHistory.ts`            | Consent, history, record, forget, for `App.tsx`                                        |
| 3   | `apps/web/src/history/RememberOffer.tsx`        | The question on the finish card                                                        |
| 3   | `apps/web/src/route/FinishScreen.tsx`           | A slot on the card above "Valmis", where `App.tsx` puts the offer until it is answered |
| 3   | `apps/web/src/history/SuggestionRow.tsx`        | One suggestion: name and "Lisää"                                                       |
| 3   | `apps/web/src/history/Suggestions.tsx`          | "Usein ostamasi", "Ostohistoria on päällä", "Unohda ostohistoria", "Älä muista"        |
| 3   | `apps/web/src/history/history.css`              | Their styles                                                                           |
| 3   | `apps/web/src/App.tsx`                          | Record on "Valmis"; show the suggestions                                               |
| 3   | `docs/ARCHITECTURE.md`, this file               | §11's current state and this file's status                                             |

## 7. Decisions

| Question                | Decision, for now                                                             |
| ----------------------- | ----------------------------------------------------------------------------- |
| Where the data lives    | **Only on the device**, in `localStorage`; no backend (ARCHITECTURE §17)      |
| Consent for the list    | **None**: keeping the shopper's own list is strictly necessary                |
| Consent for the history | **Opt-in**, asked on the finish card until answered, off by default           |
| Withdrawing             | **Always reachable** on search while history is on, one tap                   |
| Ticks over a refresh    | **Kept for 12 hours**, then cleared on load                                   |
| What counts as bought   | **Ticked items**, recorded on "Valmis"                                        |
| How much history        | **50 trips, at most a year**                                                  |
| Where suggestions show  | **Search, with the search box empty**                                         |
| Ranking                 | **Trips an item was picked on, halved every 30 days**; at least 2 trips       |
| State library           | **`useReducer` still**; Zustand (ARCHITECTURE §4) when the map needs the list |

## 8. Known gaps

- **A shop under way is not resumed** after a refresh: the app opens on search, and the
  finish card's time starts again from the next "Aloita ostokset".
- **A shop never finished with "Valmis" is not recorded.** Its ticks are cleared after 12
  hours (§2) and the trip is lost to the history.
- **A tab kept open is never checked for stale ticks.** The check runs only on load, so a
  phone that keeps the tab alive from one week's shop to the next still hides last week's
  ticked items from the route. A fix: run the check again on `visibilitychange` or
  `pageshow`. Already true before PR 2; not fixed there.
- **Tabs do not share the list.** Two open tabs each save their own; the last write wins.
  The history is safe: recording re-reads the answer and the history from storage (§3).
- **One device, one browser.** No sync, and clearing site data deletes the list and history.
- **Safari deletes the data after 7 days without a visit**, unless the app is added to the
  home screen. A weekly shopper is right at that edge.
- **"Ei kiitos" cannot be undone** until there is a settings screen (Track F "App shell").
- **Suggestions always add 1**, not the amount usually bought.
- **Shared links and saved lists** (ARCHITECTURE §11) are not covered: whether opening a
  shared link replaces or merges with the saved list is decided when sharing is built.

## 9. Order

1. **PR 1, `docs/device-storage`:** this file, §2, §11, §13 and §17 of the architecture,
   and a pointer from `docs/plans/list.md`.
2. **PR 2, `list/persist`:** the list survives a refresh (§2), and every doc and comment that
   says a reload empties it.
3. **PR 3, `list/history`:** history, the offer and suggestions (§3, §4), then this file's
   status and §11's current state.
