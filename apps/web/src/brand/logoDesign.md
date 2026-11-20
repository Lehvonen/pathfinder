# Pathfinder Logo Design

## Concept

Logo for the website. The concept is using the look from the map to
demonstrate the usage of the website. The logo is also featuring the path and destination
marks to further demonstrate the point of the website.

## Colour Palette

Ocean Blue, #00357a
Light Blue, #c2dcff
Black, #000000
Whiten, #ffffff

In the app these are CSS variables in `src/index.css` (`--ocean-blue`, `--light-blue`),
next to the page background `--bg-canvas` (#f4f8ff) and the text colour `--ink` (#08060d).

## Files

- `src/brand/pathfinder-logo.png`: the wordmark (icon + "PathFinder") in the top bar.
  653×150, three times its 50px display height.
- `public/pathfinder-icon.svg`: the icon on its own, the browser-tab favicon.
- `public/apple-touch-icon.png`: the icon at 180×180 on a solid light blue tile, for the
  iPhone home screen. iOS ignores SVG icons and fills transparency with black.
