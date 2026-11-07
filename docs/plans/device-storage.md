# Plan: the list and purchase history, kept on the device

**Status:** planned, not built. **A rough draft, not a source of truth**: written before the
code, to agree the shape. Where this file and the code disagree, the code wins.
**Architecture refs:** §2 (scope), §11 (list builder), §17 (no backend)
**Covers checklist items:** Track F "List builder, the rest" (the `localStorage` part only),
and "Purchase history and suggestions"

Two things are kept in the browser, and nothing is sent anywhere:

1. **The shopping list**, so that **refreshing the page does not empty it**.
2. **Purchase history, only if the shopper says yes**: what was picked on each finished
   shop, used to suggest things on the search screen.

There is still no backend and no accounts (§17). The data lives only on the shopper's phone.

## 1. What is stored

| Key                            | What                                                      | Written                                 | Consent                       |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| `pathfinder.list.v1`           | The list: every `ListEntry` (item and name), ticks too    | After every change to the list          | None: strictly necessary (§5) |
| `pathfinder.history.v1`        | Finished trips: the day and the picked items (§3)         | On "Valmis", only if the shopper agreed | **Opt-in**, off by default    |
| `pathfinder.historyConsent.v1` | `"yes"` or `"no"`; no key means the shopper was not asked | When the offer is answered or withdrawn | None: it is the answer itself |

- **`localStorage`, not IndexedDB.** The data is small (a trip is about 2 KB, 50 trips about
  100 KB), and `localStorage` reads synchronously, so the list is there on the first paint
  with no empty flash. IndexedDB stays for the display tier (§11 Offline).
- **The version is in the key.** A later format gets a new key; an old one is read once,
  converted if worth it, and removed.
- **Never trusted on read.** Anything that does not have the expected shape is dropped, row
  by row, never thrown (§2, §3).
- **Storage can fail.** Private browsing, blocked site data or a full quota make reads and
  writes throw. Every access is in `try`/`catch`; the app then works as it does today, in
  memory only, with no error shown.

## 2. The list survives a refresh (PR 2)

- **Loaded once on start**, as the reducer's initial state (`useReducer`'s lazy init), so
  the first render already shows the saved list.
- **Saved after every change**, from an effect on the list. "Valmis" clears the list, which
  saves an empty one; the key is then removed.
- **Ticks are kept.** A refresh in the middle of a shop keeps what was picked. Ticked items
  are left out of the next route (§11), so "Laske reitti" → "Aloita ostokset" carries on
  where the shopper was.
- **After a refresh the app opens on search**, with the list. The screen, the planned route
  and the trip (its start time) are not saved (§8).
- **Checked row by row on read.** A row is kept if it is a product with an EAN, or a generic
  entry with a category id and a word; it has a name; its amount is pulled into 1–99
  (`clampQuantity`) and `checked` is a boolean. Missing or repeated ids get a new one from
  `newItemId()`. Anything else is dropped. A product no longer in the catalogue (after a data
  update) is kept: routing handles it like any item it cannot place.

## 3. Purchase history (PR 3)

- **Off by default.** On the **first** finished shop, the finish card asks: "Muistetaanko
  ostoksesi? Ehdotamme niitä seuraavalla kerralla. Tiedot pysyvät vain tällä laitteella."
  with **"Kyllä"** and **"Ei kiitos"**, equal in size and weight. "Kyllä" stores `"yes"` and
  this trip is recorded on "Valmis". "Ei kiitos" stores `"no"` and the shopper is not asked
  again.
- **What is recorded**, on "Valmis": **ticked items only**, the nearest the app gets to
  "bought". Per item: a product's EAN, or a generic entry's category id and word; the name
  shown; the amount. The trip gets the **day** (`YYYY-MM-DD`, local time) and nothing else:
  no time, no route, no entrance. A trip with nothing ticked is not recorded.
- **Kept small:** the newest **50 trips**, none older than **365 days**, trimmed on every
  write.
- **"Unohda ostohistoria"** deletes the history at once; recording carries on from the next
  trip. **"Älä muista"** deletes the history and stores `"no"`. Both sit with the
  suggestions (§4), one tap each, with no "are you sure".

## 4. Suggestions (PR 3)

- **Where:** on the search screen while the search box is empty, under the heading **"Usein
  ostamasi"**. Shown only with consent `"yes"`.
- **Which:** things picked on **at least 2 trips**, so one-off buys are not suggested; until
  then the section is hidden. Things already on the list are left out. At most **8**.
- **Order:** each trip an item was picked on counts `0.5 ^ (age in days / 30)`, so a trip a
  month ago counts half as much as one today. Highest total first; ties go to the more
  recently picked. "The same thing" is the list's own rule: the same EAN, or the same word in
  the same category (`listReducer`).
- **Adding:** each suggestion has "+ Lisää", which adds it with amount 1 through the same path
  as search, so "Lisätty listalle: …" shows as usual.
- **Pure logic, unit-tested:** `suggestions(history, list, today)` in
  `apps/web/src/history/`, beside the list logic, not in `core`: it is about the list, which
  lives in the web app (like `listState.ts`).

## 5. Privacy

- **Nothing leaves the device.** No request carries the list or the history, and there are no
  analytics. A PR that sends either anywhere changes this plan and needs its own review.
- **GDPR.** The history is personal data, but it is kept and used only on the shopper's own
  device; the team never receives it. That keeps the exposure small, not zero.
- **ePrivacy (Article 5(3)).** Storing anything on the shopper's device, `localStorage`
  included, needs consent unless it is strictly necessary for a service the shopper asked
  for. **The list is** (like a shop's cart): no consent. **The history is not**: opt-in, off
  by default, and as easy to withdraw as to give.
- **Minimal:** the day, not the time; ticked items only; capped at 50 trips and a year.
- **If it ever goes to a server** (sync, smarter suggestions): a legal basis, a privacy
  notice and a data-processing agreement are needed. Out of scope (§2).
- **Not legal advice.** The offer's wording is checked by whoever handles data protection
  before the app is used by real shoppers.

## 6. Files

| PR  | File                                            | Role                                                                    |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| 2   | `apps/web/src/list/listStorage.ts` + test       | `loadList`, `saveList`: read and check the saved list, write it         |
| 2   | `apps/web/src/list/useSavedList.ts`             | The list reducer, started from the saved list and saved on every change |
| 2   | `apps/web/src/App.tsx`                          | `useSavedList` in place of `useReducer`                                 |
| 3   | `apps/web/src/history/history.ts` + test        | Record a trip from the ticked items; trim to 50 trips and a year        |
| 3   | `apps/web/src/history/historyStorage.ts` + test | Load, save and forget the history; the consent answer                   |
| 3   | `apps/web/src/history/suggestions.ts` + test    | The ranking in §4                                                       |
| 3   | `apps/web/src/history/useHistory.ts`            | Consent, history, record, forget, for `App.tsx`                         |
| 3   | `apps/web/src/history/RememberOffer.tsx`        | The question on the finish card                                         |
| 3   | `apps/web/src/route/FinishScreen.tsx`           | Shows the offer while the shopper has not been asked                    |
| 3   | `apps/web/src/history/Suggestions.tsx`          | "Usein ostamasi", "+ Lisää", "Unohda ostohistoria", "Älä muista"        |
| 3   | `apps/web/src/history/history.css`              | Their styles                                                            |
| 3   | `apps/web/src/App.tsx`                          | Record on "Valmis" with consent; show the suggestions                   |

## 7. Decisions

| Question                | Decision, for now                                                       |
| ----------------------- | ----------------------------------------------------------------------- |
| Where the data lives    | **Only on the device**, in `localStorage`; no backend (§17)             |
| Consent for the list    | **None**: keeping the shopper's own list is strictly necessary          |
| Consent for the history | **Opt-in**, asked once on the first finish card, off by default         |
| What counts as bought   | **Ticked items**, recorded on "Valmis"                                  |
| How much history        | **50 trips, at most a year**                                            |
| Where suggestions show  | **Search, with the search box empty**                                   |
| Ranking                 | **Trips an item was picked on, halved every 30 days**; at least 2 trips |
| State library           | **`useReducer` still**; Zustand (§4) when the map needs the list        |

## 8. Known gaps

- **A shop under way is not resumed** after a refresh: the app opens on search, and the
  finish card's time starts again from the next "Aloita ostokset".
- **Tabs do not share changes.** Two open tabs each save their own list; the last write wins.
- **One device, one browser.** No sync, and clearing site data deletes the list and history.
- **Safari deletes the data after 7 days without a visit**, unless the app is added to the
  home screen. A weekly shopper is right at that edge.
- **"Ei kiitos" cannot be undone** until there is a settings screen (Track F "App shell").
- **Suggestions always add 1**, not the amount usually bought.
- **Shared links and saved lists** (§11) are not covered: whether opening a shared link
  replaces or merges with the saved list is decided when sharing is built.

## 9. Order

1. **PR 1, `docs/device-storage`:** this file, §2, §11, §13 and §17 of the architecture,
   and a pointer from `docs/plans/list.md`.
2. **PR 2, `list/persist`:** the list survives a refresh (§2).
3. **PR 3, `list/history`:** history, the offer and suggestions (§3, §4), then this file's
   status and §11's current state.
