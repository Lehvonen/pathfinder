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

52 areas: 48 where goods are sold, 3 checkout areas (two Kassat, Itsepalvelukassat) and the
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

## 5. `data/graph/department-level.json` — the walk graph

**A rough first draft, not a source of truth.** Its job is that every product can be routed
now, so the router and the app have a real store to work against. The file says so in its
`note` field. It is replaced section by section once the map editor exists (§8).

- **Aisles** run along the gaps between the map's blocks: a front aisle under the clothes,
  the main cross-corridor, one between the dry-goods blocks and the chilled rows, a back
  aisle along Palvelutiski and Maitokaappi, and the vertical aisles between the columns,
  including the chilled rows' own. 128 junctions where aisles cross or end, or where an
  area links in.
- **One access node per area** (`<area>:0`, 51 of them, the Kahvila has none), linked to
  the aisle along **every side of the area that is open**: an aisle runs alongside it,
  outside it, at most 5 m away, for at least a metre. A side facing a neighbouring block
  has no aisle that close and gets no link. An area against a wall is open on one side and
  its node stands at that edge; a block in the middle of the store is open on two to four
  sides and its node stands at its centre. The big dry-goods blocks and the chilled rows
  are open on all four. A checkout area's node has kind `checkout`; the two entrances
  (`<entrance>:0`) link to the nearest aisle end.
- **A route never passes through an access node.** It may start or end at one, but a
  block's centre node joins aisles on opposite sides, so walking through it would cut
  through the shelves. The router (Track D) must treat access and checkout nodes as dead
  ends unless they are the leg's start or end.
- **One shelf per department**, `<department>:00`, 198 of them, each at its area's access
  node and drawn with its area's outline. Every shelf of a department, `91208:05` as much
  as `91208:00`, routes to that node: a placement whose shelf is not in the graph falls
  back to its department-wide shelf. That keeps every product routable until shelves are
  mapped one by one, and is the rule the shelf matching in `build-data.ts` will follow.
- **Weights** are straight-line metres at the placeholder scale (§3), with one exception: an
  access link weighs the walk from the aisle to the area's edge, not to its centre, so a
  stop costs the same from any side. Paced weights replace them after the verification
  walk.

`validateGraph` (`scraper/normalise/schema.ts`) checks the file against the contract
(`Graph` in types.ts, plus the `note`), every reference, that every node can be reached
from an entrance, and that every department with products has its `:00` shelf.

Known shortcuts:

- The left pocket (Juusto, Juurekset, Leipä, Texmex, Paistopiste) is reached only from the
  main cross-corridor. The map shows no way past the Kahvila to the back aisle.
- A department in two areas, such as 551 Vapaa-aika ja pukeutuminen, routes to one of them.

## 6. Check on the store visit

- The unlabelled strip under Leipä: what is sold there
- Which side of each block the shelves face, where the map does not show it
- The two entrances: both are doors in, not one in and one out, and where exactly each
  door is along the right wall
- Every `reviewed: false` row in §4
- Whether the left pocket has a way through to the back aisle
