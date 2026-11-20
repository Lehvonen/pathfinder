# Plan: the logo, the top bar and the colours

**Status:** built (#35, #36). **A rough draft, not a source of truth**: where this file and
the code disagree, the code wins.
**Architecture refs:** §11 (the screens), §14 (performance targets)
**Design notes:** `apps/web/src/brand/logoDesign.md`

## 1. The top bar

- **A sticky bar with the logo** at the top of search, the route overview and the edit list.
  Tapping the logo goes back to search and closes any open category.
- **Hidden on shopping and finish**, where the map and the sheet need the whole screen.
- **A `<header>` outside `<main>`**, so screen readers find it as the page's banner.
- **Its height is `--topbar-height`**, border included, calculated from the logo height,
  the paddings and the border, so changing one of them moves the bar and the sticky search
  bar together. The search bar sticks at that offset, so the two never overlap.
- **The bar is `apps/web/src/TopBar.tsx`.** `App` decides what the logo does (`onHome`);
  which screens show the bar is `showsTopBar` in `apps/web/src/screen.ts`, tested.

## 2. Colours

CSS variables in `apps/web/src/index.css`: `--ocean-blue`, `--light-blue`, `--bg-canvas`,
`--ink`, `--border-subtle`, plus the route's two greens.

- **Primary buttons are ocean blue**: "Laske reitti", "Aloita ostokset", "Valmis".
  "Lopeta ostokset" stays green, the route's colour.
- **Button hover is light blue with ocean-blue text.** The base button style and the hover
  are both zero-specificity (`:where`), so the hover wins by coming later and any rule
  with a class beats both: a button keeps whichever of background and colour its own rule
  sets. Only on devices that can hover, so the colour doesn't stick after a tap.
- **"✓ Kerätty" does not change on hover**: it sets its own background, because its green
  text on light blue is too faint.
- **The two sheet headings** (the list panel's and the shopping sheet's) have no
  background, so on hover only their text turns ocean blue.

## 3. Icons

- **Browser tab:** `public/pathfinder-icon.svg`, a square 764×764 viewBox with the blues
  set to the palette's exact values. Still raw tracer paths, about 21 KB: the repo has no
  SVG optimiser.
- **iPhone home screen:** `public/apple-touch-icon.png`, 180×180 on a solid tile, named
  "PathFinder" by `apple-mobile-web-app-title`.
- **The top-bar logo is a 653×150 PNG** (about 8 KB), small enough not to compete with the
  data on a cold load (§14).

## 4. Not done yet

- A web app manifest (192 and 512 px icons) for Android home screens.
- A favicon that reads on dark browser tabs: the icon is near-black on white.
- A test that the logo closes an open category and goes to search. It is two state
  updates in `App`, which has no tests, and the web package has no DOM test library.
