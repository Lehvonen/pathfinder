# Plan: shopping list

**Status:** rough first version built (PR #25). **A rough draft, not a source of truth**:
written after the code, to record what it does and what is still open. Where this file and
the code disagree, the code wins.
**Architecture refs:** §6 (generic entries), §11 (list builder, current state), §4 (Zustand),
§17 (list items: `id` + `quantity`)
**Covers checklist items:** Track F "List builder, rough version". Not "the rest": reorder,
check off, Zustand, `localStorage`

The list is what routing (Track D) takes as input, so it comes before the map and the route.
The shopper adds items from search, sets how many of each, and removes what they don't need.
"Laske reitti" is where routing will be connected.

## 1. Files

All in `apps/web/src/list/`:

| File                  | Role                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `listState.ts` + test | The list logic: `listReducer`, `clampQuantity`, `newItemId`. No React, unit-tested |
| `ShoppingList.tsx`    | The panel: open / close heading, the rows, the empty message, "Laske reitti"       |
| `ShoppingListRow.tsx` | One row: name, − amount +, "Poista"                                                |
| `list.css`            | The fixed bottom panel, rows and stepper                                           |

`App.tsx` holds the state (`useReducer(listReducer, [])`) and builds each `ListItem` when
search's "Lisää" is pressed. The logic file is `listState.ts`, not `shoppingList.ts`: that
name differs from `ShoppingList.tsx` only by a capital letter, which Windows treats as the
same file.

## 2. The list state

- **`ListEntry = { item, name }`.** `item` is the contract's `ListItem`
  (`packages/core/src/types.ts`, unchanged). A product `ListItem` holds only its EAN, so the
  name the shopper picked is kept beside it rather than looked up in the search data. A
  generic entry is named with its category: `"maito" (Maidot)`.
- **Three actions:** `add`, `remove`, `setQuantity`. The reducer is pure (it never changes
  the list it is given), so React's development double call is safe.
- **One row per thing.** Adding something already on the list raises its amount instead of
  adding a second row. The same thing is the same EAN for a product, or the same word in the
  same category for a generic entry. A product never merges with a generic entry.
- **Amount: a whole number from 1 to 99.** It never drops to 0: taking an item off is
  `remove`, so there are no rows with nothing to buy. 99 is a plain cap so the stepper has an
  end, not a researched number.
- **Ids from `newItemId()`.** `crypto.randomUUID()` where the page has it; otherwise the time
  plus a counter. `randomUUID` exists only on https and localhost, and the dev server opened
  from a phone (`http://192.168.…`) is neither: without the fallback, adding crashed there. An
  id only has to be unique within one list; a shared list gets new ids on load (types.ts).
- **In memory only.** A reload empties the list. Keeping it over a refresh is planned in
  `docs/plans/device-storage.md` §2.

## 3. The panel

- **Fixed to the bottom of every page**, search and category pages alike, centred at the
  same 640 px as `main`, above the sticky search bar.
- **The heading "Ostoslista (n)" opens and closes it.** A button inside the `<h2>`, with
  `aria-expanded` and `aria-controls`. `n` counts rows, not total amounts.
- **Starts closed**, so the results get the screen. Adding does not open it: the shopper is
  usually adding several things in a row.
- **Open, the rows scroll within half the screen.**
- **"Laske reitti" shows open or closed**, disabled while the list is empty. It does nothing
  yet.
- **Room under the page:** `body` gets 160 px of bottom padding so the last search result
  clears the closed panel (its height is about 118 px plus the iPhone home bar).
- **Always mounted**, so it stays open or closed across pages.

## 4. Decisions

| Question                     | Decision, for now                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| State library                | **`useReducer`**, not Zustand yet. Zustand (§4) when the map needs the list too     |
| Same thing added twice       | **One row, amount raised**                                                          |
| Lowest amount                | **1**; removing is its own action                                                   |
| Where the list lives         | **A closable panel at the bottom of every page**, closed by default                 |
| Item ids on plain-http pages | **Time plus a counter**, `crypto.randomUUID()` everywhere else                      |
| Component tests              | **None**: the web app has no component-testing library; the logic is in the reducer |

## 5. Known gaps

From the PR #25 review, checked against the code. Not fixed yet:

- **A repeat add shows no change.** The row count and the "Lisätty listalle: …" note stay
  the same, so with the panel closed it looks like nothing happened, and a screen reader
  hears nothing. Fix: show the new amount in the note, "Lisätty listalle: Maito (2 kpl)".
- **"Maito" and "maito" become two rows.** Generic entries match on the exact word, and the
  word keeps the case and spaces the shopper typed (`SearchResults.tsx`). Fix: compare with
  `fold()` from `@pathfinder/search` (export it first), keeping å, ä and ö.
- **Missing test cases:** `add` not changing its input, a product never merging with a
  generic entry, a repeat add keeping the first name, an amount over 99 through the reducer,
  an unknown id in `setQuantity`.
- **Focus is lost** after "Poista", and when − or + becomes disabled under the finger; it
  jumps to the top of the page. For the Track F accessibility pass.
- **The `types.ts` comment** says ids always come from `crypto.randomUUID()`; not true on
  plain http. Its own small PR, since `types.ts` changes need two reviewers.
- **Small CSS points:** fixed ids instead of `useId()` in `ShoppingList.tsx`; the open list
  should use `50dvh` (the visible screen on iPhone Safari), with `vh` as the fallback.
  `viewport-fit=cover` is left out until it can be checked on a phone, so the home-bar
  padding may be 0 on an iPhone.

## 6. Next

1. **Connect "Laske reitti" to routing** (Track D): resolve each item to a node (products
   through their placement, generic entries through `CategoryPlacement`), then order the
   stops.
2. **Keep the list over a reload**: `localStorage`, planned in `docs/plans/device-storage.md`.
   Zustand is not needed for it; the reducer stays until the map needs the list.
3. **Check off**, which later advances the map (§11).
4. **Reorder, share links, saved and recurring lists** (§11).
