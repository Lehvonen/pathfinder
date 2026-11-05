# Map — the department-level store map

Track C, ARCHITECTURE.md §8. This file records where the map came from and what is still a
guess, so the store visit knows what to check.

## 1. Source

K-Citymarket's own store map of Kupittaa, linked from the QR code in the store:
<https://aineistot.fi/k-citymarket/turku-kupittaa/> (the SVG is
`KCM_Turku_Kupittaa.svg`). It is not committed: the map is K-Citymarket's, and the repo is
public. Only our traced outlines are.

The SVG is an Illustrator export with no transforms, and every area is one filled shape, so
the outlines are read from the shapes' bounding boxes, not traced by hand. Rounded corners
are dropped. Two areas are drawn as two shapes each (Kukat, Kahvila) and are stored as one
L-shaped polygon.

## 2. `data/graph/areas.json`

54 areas: 50 where goods are sold, 3 checkout areas (two Kassat, Itsepalvelukassat) and the
Kahvila. The `id` is the map label in lowercase kebab-case, with å, ä and ö kept as they are; a label printed twice
(Jalkineet, Sesonki, Kassat) gets `-1` and `-2`, top to bottom. The two dry-goods blocks
are labelled on the map with a list of contents, not a name; their ids are `kuivaruoat` and
`makeiset`, and the list is kept as the label.

Two entrances, where every route starts. The map draws each as a row of chevrons on the
right side pointing into the store; the point is the arrow's outer (right) end:
`sisäänkäynti-1` by Kukat and Asiakaspalvelu, `sisäänkäynti-2` on the main cross-corridor
between the two Kassat. Areas and entrances share one id space.

One thin strip under Leipä has no label on the map (`nimetön-leipä`). It overlaps the top
of Texmex in the source drawing, and is kept as drawn.

## 3. Coordinates

Metres, origin at the top-left of the floorplan (the top edge of Naisten vaatteet, the left
edge of Outlet), y down, one decimal (types.ts, walk graph).

**The scale is a placeholder.** The map is schematic and gives no scale. 0.22 m per map unit
makes the store about 109 m wide and 127 m deep, with side aisles about 3.5 m and the main
cross-corridor about 4 m wide. That only affects displayed distance and time, never the stop
order (§8, fidelity). Paced edge weights replace it after the verification walk; if one
building measurement is taken from a map service first, `metresPerSourceUnit` is the one
number to change.

## 4. `data/curation/department-areas.json`

Which area each department is in: one row per department that has products, 198 rows, in
the store's own walking order (`orderNumber`). `name` is K-Ruoka's department name, for
whoever reviews the row. Each department sits in one area for now, so every product in it
routes to that area; a department whose shelves span two areas is split later, by shelf.

The validator (`validateDepartmentAreas` in `scraper/normalise/schema.ts`) fails when a
department with products has no row, so a product is never silently unroutable, and when a
row names an area or department that does not exist.

How the rows were placed:

- **By the map label**, most rows: (PAKASTE) → Pakasteet, (HYGIENIA) and (KAUNEUS) →
  Hygienia, (KYLMÄ-A) Pakattu kala → Kala, and so on.
- **The numbered dry-goods aisles** split along the two blocks' content lists: TEOLLINEN 1–8
  (ravintolisät, hiutaleet, pastat, riisit, säilykkeet, öljyt) → `kuivaruoat`, TEOLLINEN
  9–16 (maailman maut, mausteet, leivonta, keksit, kahvit, sipsit, makeiset, pähkinät) →
  `makeiset`.
- **PANIMO by its products**, not its number: 19–22 and the K-18 rows are beers, ciders and
  juices → `mehut-viinit-oluet`; 23–24 and the multipacks are soft drinks and water →
  `virvoitusjuomat`.
- **By judgement**, 16 rows marked `reviewed: false`, listed below. Delete the marker once
  the row is checked in the store.

| Department                                         | Placed in                    | Why it is a guess                                 |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------------- |
| 55461 Glögit                                       | `sesonki-2`                  | seasonal drinks, zone says Maidot                 |
| 550 (KT 11) Säilytys ja pyykinkuivaus              | `siivous`                    | KT 11 also holds roskapussit and nenäliinat       |
| 594 (MAITO) Kermat, rahkat ja raejuustot           | `maitokaappi`                | could be beside Jogurtit instead                  |
| 109059 (SUSHIPISTE) Amerikka-hylly                 | `sushi`                      | sweets and syrups, named after the sushi point    |
| 572 (KYLMÄ-E) Grillaus, Poppamies                  | `lihat-broilerit-kananmunat` | ambient BBQ sauces, likely an end of the meat row |
| 606 (KYLMÄ-C) Ruokamakkarat, annossalaatit ja vege | `makkarat-leikkeleet`        | the map puts vege with Valmisruoka                |
| 55486 (LEIPÄ) Gluteeniton leipähylly               | `leipä`                      | could be in the Gluteeniton area                  |
| 614 (LEIPÄ) Kylmäsäilytyskalusteet                 | `leipä`                      | chilled cakes; may be the unlabelled strip        |
| 90551 (JUUSTO) Juustotiski                         | `juusto`                     | a counter; could be part of Palvelutiski          |
| 95034 Kaupan sisääntulot                           | `kassat-1`                   | one magazine, somewhere by an entrance            |
| 590 (KT 16) Autotarvikkeet ja työkalut             | `urheiluvälineet`            | between KT 15 (urheilu) and KT 17 (lelut)         |
| 551 (KT) Vapaa-aika ja pukeutuminen                | `kodintekniikka`             | 1,180 products: headphones, gadgets, bags         |
| 612 (KT) Muji, keräilykalusteet                    | `sesonki-1`                  | one product, a sparkler                           |
| 55478 (HEVI) Deliverde-piste                       | `hedelmät-vihannekset`       | potted herbs, zone says Lämpimät                  |
| 620 Lämminsäilytettävät*                           | `hedelmät-vihannekset`       | herbs and meringues, zone says Lämpimät           |
| 97645 Urheilu- ja merkkitekstiilit                 | `naisten-vaatteet`           | caps and beanies, no gender                       |

Areas with no department yet: `jalkineet-1`, `jalkineet-2`, `laukut`, `irtomakeiset`,
`pica-deli`, `kylmät-mehut`, `nimetön-leipä`, and the non-shopping `kahvila`, `kassat-2`
and `itsepalvelukassat`. The scrape has no department named for the first six; their
products are probably filed under a neighbour (bags and shoes under 551, juices under 583).

## 5. Check on the store visit

- The unlabelled strip under Leipä: what is sold there
- Which side of each block the shelves face, where the map does not show it
- The two entrances: both are doors in, not one in and one out, and where exactly each
  door is along the right wall
- Every `reviewed: false` row in §4
