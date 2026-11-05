# Plan: the route map and shopping screens

**Status:** PR A (overview, edit list, map) built. PR B (shopping, finish) and PR C (gestures)
next. **A rough draft, not a source of truth**: a prototype to be polished later. Where this
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
- **"← Takaisin reittiin"** plans the route again for the list as it is, so removed items
  drop out; an empty list goes back to search.

## 2. The map (PR A)

`apps/web/src/map/`: `mapView.ts` (geometry, tested), `StoreMap.tsx`, `map.css`.

- **The store's areas as filled grey shapes**, no outlines. **No other lines**: no aisles,
  no walk graph.
- **Names are hidden below 7 screen pixels per metre**, where 52 names would overlap; long
  names are cut to their first part ("Lihat…").
- **The route as a green line:** the leg to the next stop and the legs already walked in
  **deep green**, the legs after the next in **see-through green**.
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

## 4. Performance

- **The screen paints first, the planning comes straight after:** the planned list is a
  deferred value, so "Lasketaan reittiä…" shows at once. If that is still slow on a real
  phone (both entrances, up to about 38 ms each on a PC), the next step is a web worker.
- **The map is drawn once**: 52 shapes, one line. It measures itself and redraws only when
  its size changes.
- **(C) Gestures change the view directly, outside React**, once per screen refresh; no
  gesture library.
- **No extra download:** the map uses `graph.json` and `areas.json`, already loaded.

## 5. Shopping (PR B) and gestures (PR C), planned

- **Ticks:** each item has a tick; the route moves to the next stop **when every item at the
  current stop is ticked**, and unticking steps back. The list's `checked` field holds the
  ticks (`setChecked`, PR A).
- **The sheet:** about 30 % with the current stop's items; dragged up (C; a tap in B) it shows
  the whole list, scrollable.
- **Zoom:** fits the next leg automatically on every move; pinch and pan (C) to look around.
- **Finish:** the line fills in deep green, a card "Valmis! 14 tuotetta · 322 m · aikaa
  kului 11 min" (time from "Aloita ostokset"), a short green confetti burst (none with
  reduced motion), and "Valmis" back to search with an empty list (`clear`, PR A).

## 6. Known gaps

- **`RoutePage.tsx` and `RouteStopRow.tsx` are unused** after PR A: removing `RoutePage`
  in the same PR would change it twice. PR B removes it, and reuses `RouteStopRow` or
  removes it.
- **No start or checkout marker** on the map yet: the line simply starts and ends there.
- **Names show only zoomed in**, so the overview of a whole store on a phone has none.
- **The list is kept in memory only**: a reload mid-shop loses it. Saving it comes later.
- **Recalculating mid-shop starts from the entrance**, not from where the shopper is.
