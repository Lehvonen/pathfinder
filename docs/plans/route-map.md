# Plan: the route map and shopping screens

**Status:** PR A (overview, edit list, map) merged (#29), PR B (shopping, finish) merged
(#30), PR C (gestures) merged (#31), PR D (turning the map) built. **A rough draft, not a source of truth**: a prototype to be polished later. Where this
file and the code disagree, the code wins.
**Architecture refs:** §9 (routing), §11 (list builder, map view, trip summary), §14
(performance targets)
**Builds on:** `docs/plans/routing.md` (the route itself)

"Laske reitti" leads to a **map of the route**, then to a **shopping screen** that walks the
shopper from stop to stop. **No lag and fast loading come first**: every choice below is made
for that.

## 1. Screens

| Screen         | What's on it                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Search         | As before: search, the list panel and "Laske reitti"                                                                                         |
| Route overview | "← Takaisin" · summary · the whole route on the map · "Aloita: Sisäänkäynti 1" · "Aloita ostokset", "Muokkaa listaa", "Vaihda aloituspaikka" |
| Edit list      | "← Takaisin reittiin" · each item with − / + and "Poista" · "+ Lisää tuotteita" back to search                                               |
| Shopping (B)   | "← Takaisin" · map about 70 % · a sheet about 30 % with the current stop's items, a tick on each                                             |
| Finish (B)     | The line fills in, a card with the trip in numbers and confetti, "Valmis"                                                                    |

- **The list panel and "Laske reitti" only show on search.** The route screens replace them.
- **The logo bar shows on search, the route overview and the edit list**, not on shopping or
  finish (`docs/plans/logo.md`). It takes about 90 px at the top, above the map.
- **"← Takaisin reittiin"** plans the route again for the list as it is, so removed items
  drop out; an empty list goes back to search.

## 2. The map (PR A)

`apps/web/src/map/`: `mapView.ts` (what to show at what size, leg states, labels; tested),
`StoreMap.tsx`, `CompassButton.tsx` (the north button), `map.css`. Plain geometry (`boundsOf`, `fitView`, `pathData`) is in
`packages/core/src/geometry.ts`, as ARCHITECTURE.md §17 asks. The view's own maths (pan,
zoom, turn, angles: `panZoom.ts`, `mapView.ts`) stays in `apps/web/src/map/`, since only
this app uses it.

- **The store's areas as filled grey shapes**, no outlines. **No other lines**: no aisles,
  no walk graph.
- **Names are hidden below 7 screen pixels per metre**, where most of the 52 would overlap;
  long names are cut to their first part ("Lihat…"). A rough line: a few neighbours still
  touch just above it (§6).
- **The route as a green line:** the leg to the next stop and the legs already walked in
  **deep green**, the legs after the next in **light green**. Solid, not see-through: legs
  sharing an aisle would otherwise add up to a darker green.
- **A numbered node at each stop:** a circle a little wider than the line, so the line bulges,
  with a black number.
- **Line width, node size and text size stay the same on screen** at any zoom.
- **The overview fits the whole route** to the map; the shopping screen (B) fits the next leg.

## 3. Start position (PR A)

- **The route starts at entrance 1** by default. "Vaihda aloituspaikka" switches to the next
  entrance, going round.
- **The route is planned from every entrance at once** when the button is pressed
  (`planRoute`'s new `start` option), so switching is instant. The checkout is still chosen
  with the order.
- **Each entrance is planned on its own:** one that can't be planned from (a map error from
  it alone) is left out and the others still work; with none left, a map error.

## 4. Performance

- **The screen paints first, the planning comes straight after:** the planned list is a
  deferred value, so "Lasketaan reittiä…" shows at once. If that is still slow on a real
  phone (about 17 ms per entrance, 35 ms for both, at 15 stops on a PC), the next step is
  a web worker. Usually, not always: the deferred render is a separate task, so the browser
  normally paints first.
- **The map draws once it is measured, then only when it must:** 52 shapes, one path per
  leg, a node per stop. It skips an unchanged size, is `memo`, and gets the same `focus`
  object for the same route (`routeFocus`).
- **The overview map is `55svh` tall**, not `dvh`: it keeps its size while a phone's
  address bar shows and hides, so nothing jumps or redraws while scrolling.
- **Gestures change the view directly, outside React** (`usePanZoom`): each frame sets the
  SVG's `viewBox` and the store's turn, at most once per screen refresh, and React redraws
  only once, when the gesture ends, so node and name sizes fit the new zoom. No gesture
  library. The maths (`panZoom.ts`: pan, pinch and twist around the fingers, when a twist
  starts turning, wheel zoom and turn around the mouse, the limits, the snap to north) is
  tested. A gesture started during a glide starts from what is on screen when the finger goes
  down; the glide runs on until the finger moves, so the first move can pull the map back a
  little.
- **Turning:** a view is its box plus an angle, the store turned around the box's centre (one
  SVG `rotate` on the store). Two fingers turn the map once they twist past 10°, so a pinch
  that isn't quite straight doesn't tilt it; the twist then counts from there, with no jump.
  On a PC, Shift and the mouse wheel turn it, about 15° a notch. Names and stop numbers turn
  back by the same angle (one CSS variable, `--map-turn`), so they stay level. A turn that
  ends within 5° of north settles to north, with the usual glide (at once with reduced motion, and on the finish map,
  which never glides).
  Once a turn ends (the fingers lifted, or the wheel still for 0.15 s), a turned map shows a north
  button top right ("Pohjoinen ylös"), its needle turning with the map, that turns it back the
  same way; focus then moves to the map, since the button goes away. Each screen's map starts north up:
  a turn on the overview doesn't carry into shopping, and the finish is drawn north up.
- **Limits:** no closer than 12 m across, no further out than 1.5 times the store, and the
  view's centre kept inside the store. Any angle.
- **The glide:** a new focus (the next leg) glides there in 0.25 s from whatever is on screen,
  a pan, zoom or turn included, turning the short way round; at once with reduced motion. The
  view the shopper chose holds until the focus changes; the angle holds after that too, and
  the new focus is fitted as it lies on the turned map.
- **No extra download:** the map uses `graph.json` and `areas.json`, already loaded.

## 5. Shopping (PR B) and gestures (PR C)

- **"Aloita ostokset"** on the overview fixes the route as it is then (with the chosen
  entrance) and opens the shopping screen: "← Takaisin" and "Pysähdys 2/12: Maitokaappi ·
  180 m jäljellä" at the top, the map in about 70 %, the sheet in the bottom 30 %.
- **Ticks:** each item has a round tick; the route moves to the next stop **when every item
  at the current stop is ticked**, and unticking steps back (`stopsDone` in `progress.ts`).
  The list's `checked` field holds the ticks, so going back to search keeps them, and
  "Laske reitti" then routes only what is left. The list panel and "Muokkaa listaa" show a
  ticked item struck through, with "✓ Kerätty" to untick it and route it again.
- **Focus:** when a stop is done with the sheet closed, focus moves to the next stop's
  heading (or "Kaikki kerätty"), since the ticked button has just left the screen; with it
  open, focus stays on the button.
- **The sheet:** about 30 % with the current stop's items; its heading opens it over 85 %
  with every stop and any items with no place, scrollable. Its heading opens and closes it with a tap, or
  drags it (`useSheetDrag`): the sheet follows the finger with no React render, then settles
  at the nearer end, or the way it was flicked (`sheetDrag.ts`, tested). It
  moves with `transform`, so opening it never lays the page out again. Closed, its body fits
  the visible 30 % and scrolls, so a stop with many items never runs off the screen. No
  pull-to-refresh while shopping: a reload keeps the list but leaves the shop for search.
- **Zoom:** fits the leg to the next stop automatically on every move (`legFocus`, cached so
  a tick that doesn't move the route on doesn't redraw the map), gliding there; pinch and pan to look around,
  and twist to turn the map the way the shopper faces. The turn stays from leg to leg until
  the north button, or a turn back to near north, undoes it.
- **Finish:** once every stop is done the sheet says "Kaikki kerätty – kassalle!" with
  "Lopeta ostokset". The finish screen draws the whole route's legs in, one after another,
  over 1.2 s whatever the route's length (widths in metres while filling: with fixed screen
  widths the dashes come out as a dashed line); then a card "Valmis! 14 tuotetta · 322 m ·
  aikaa kului 11 min" (every ticked item; the time from the first "Aloita ostokset") and 30 pieces of green confetti, all CSS (none with reduced motion). "Valmis"
  goes back to search with an empty list (`clear`).

## 6. Known gaps

- **No start or checkout marker** on the map yet: the line simply starts and ends there.
- **Names show only zoomed in**, so the overview of a whole store on a phone has none
  (about 3.4 px/m). Above 7 px/m, 4 pairs on the real map still touch (e.g. "Kala" and
  "Valmisruoka, vege"), and "Itsepalvelukassat" is wider than its area, all measured north
  up: tune the line or the cut length. On a turned map names stay level while their areas
  turn under them, so which ones touch changes with the angle: an area wide north up is tall
  and narrow turned a quarter, and its name runs across its neighbours.
- **A reload mid-shop leaves the shop**: the list and its ticks are kept
  (`docs/plans/device-storage.md`), but the app opens on search and the trip time restarts.
- **Recalculating mid-shop starts from the entrance**, not from where the shopper is.
- **The finish card's metres are the last plan's:** after a re-plan mid-shop it counts only
  the route planned then. The items and the time cover the whole shop.
- **A shop given up is still timed from its start:** going back to search mid-shop and later
  starting again (without "Valmis") times the finish from the first start.
- **The shopping screen's wiring in `App.tsx`** (fixing the route, the finish, "Valmis") has
  no tests: the web app has no component or hook tests yet. The logic it uses
  (`progress.ts`) is tested.
- **The map's wiring has no tests either:** `usePanZoom` (listening to the pointers and the
  wheel, a third finger, a button over the map) and `StoreMap` (the kept angle, the snap, the
  north button, focus after it). The maths and the decisions they use (`panZoom.ts`,
  `mapView.ts`) are tested.
- **No keyboard or button way to pan, zoom or turn the map:** gestures and the wheel only.
  The north button is the only control, and it shows only once the map is turned.
- **A view chosen by a gesture outlives a change of size:** it is kept until the focus
  changes, so after a phone is turned sideways it no longer has the screen's shape (which the
  turn maths assumes, `MapView`). The SVG then fits it with bars at the sides, and gestures
  slide a little under the fingers. Fix: drop the chosen view on a new size, or refit it
  round its centre.
