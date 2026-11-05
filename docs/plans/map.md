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

## 4. Check on the store visit

- The unlabelled strip under Leipä: what is sold there
- Which side of each block the shelves face, where the map does not show it
- The two entrances: both are doors in, not one in and one out, and where exactly each
  door is along the right wall
