import type { Route } from '@pathfinder/core';
import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { MapAreas } from '../route/loadRoutingData';
import {
  drawOrder,
  labelPoint,
  legsOf,
  legStates,
  pathData,
  screenView,
  shortLabel,
  showsLabels,
  storeBounds,
  type MapView,
  type ScreenSize,
  type ViewBox,
} from './mapView';
import CompassButton from './CompassButton';
import { glideView, snapNorth, turnAttribute, viewBoxAttribute } from './panZoom';
import { usePanZoom } from './usePanZoom';

type StoreMapProps = {
  areas: MapAreas;
  route: Route;
  /** How many stops are done; decides which leg is next (`legStates`). */
  current: number;
  /** The part of the store to fit on screen, in metres. Keep it the same object between
   *  renders (a cached one, like `routeFocus`), or the map redraws each time. */
  focus: ViewBox;
  /** What the map shows, for a screen reader: the SVG itself says nothing. */
  label: string;
  /** Draws each leg in, one after another, from the start to the checkout: the finish. */
  filling?: boolean;
};

/** Sizes on screen, in pixels, whatever the zoom. */
const NODE_RADIUS_PX = 10;
const NUMBER_PX = 12;
const LABEL_PX = 11;
/** The route line's width; map.css sets it in pixels, except while filling (below). */
const LEG_PX = 6;
/** How long the map takes to glide to a new focus. */
const GLIDE_MS = 250;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A view as one string, angle last: a value an effect can depend on. */
const keyOf = (view: MapView) => `${viewBoxAttribute(view)} ${view.angle ?? 0}`;

/** A view back from its `keyOf` string. */
function viewOfKey(key: string): MapView {
  const [x, y, width, height, angle] = key.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { x, y, width, height, angle };
}

/** The CSS variable map.css turns names and numbers back by, so they stay level, and the
 *  north button's needle with the map. Set on the map's box, so both get it. */
const MAP_TURN = '--map-turn';

/**
 * What the map's elements are given to show `view`, by a render or straight by `drawView`, so
 * the two always match: the SVG's viewBox, the store's turn, and the turn names and numbers
 * undo.
 */
const drawnAs = (view: MapView) => ({
  viewBox: viewBoxAttribute(view),
  transform: turnAttribute(view),
  turn: view.angle ?? 0,
});

/** Shows `view` straight on the map, outside React, as a render would: for gestures and the
 *  glide. */
function drawView(box: HTMLElement, svg: SVGSVGElement, store: SVGGElement, view: MapView) {
  const drawn = drawnAs(view);
  svg.setAttribute('viewBox', drawn.viewBox);
  store.setAttribute('transform', drawn.transform);
  box.style.setProperty(MAP_TURN, String(drawn.turn));
}

/**
 * The store map with the route on it: the areas as grey shapes, their names once zoomed in
 * far enough to fit, the route as a green line in three states, and a numbered node at each
 * stop. It fills its container and fits `focus` into it. It measures itself first and draws
 * nothing until then; after that it redraws only when its size or its props change (`memo`).
 *
 * Pinch, pan, twist and the mouse wheel move and turn the view (`usePanZoom`), changing the
 * SVG directly with no redraw until the gesture ends. Names and numbers stay level however
 * the map is turned. A turn that ends within NORTH_SNAP of north goes straight to north, and
 * a turned map shows the north button to turn it back. The view the shopper chose holds until
 * `focus` changes; then the map glides to the new focus in GLIDE_MS (at once with reduced
 * motion), keeping its angle.
 */
function StoreMap({ areas, route, current, focus, label, filling = false }: StoreMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  /** The store inside the SVG, turned with the map. */
  const store = useRef<SVGGElement>(null);
  const [size, setSize] = useState<ScreenSize | null>(null);
  // The view a gesture ended on, for the focus it was made on: a new focus drops it.
  const [chosen, setChosen] = useState<{ focus: ViewBox; view: MapView } | null>(null);
  // How far the shopper turned the map: a new focus keeps it.
  const [angle, setAngle] = useState(0);
  /** The view the SVG shows now, whoever set it: React, a gesture or the glide. */
  const showing = useRef<MapView | null>(null);
  const glide = useRef(0);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      // The same size again (the observer's first call does this) changes nothing.
      setSize((last) =>
        last !== null && last.width === width && last.height === height ? last : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitted = screenView(focus, size, angle);
  const view = chosen !== null && chosen.focus === focus ? chosen.view : (fitted?.view ?? null);
  const viewKey = view === null ? '' : keyOf(view);

  usePanZoom({
    target: box,
    state: view === null || size === null ? null : { view, size, store: storeBounds(areas) },
    showing: () => showing.current,
    onFrame: (next) => {
      cancelAnimationFrame(glide.current);
      showing.current = next;
      if (box.current !== null && svg.current !== null && store.current !== null) {
        drawView(box.current, svg.current, store.current, next);
      }
    },
    onEnd: (next) => choose(snapNorth(next)),
  });

  /** Holds `next` as the shopper's view for this focus, and its angle for the next ones. */
  function choose(next: MapView) {
    setChosen({ focus, view: next });
    setAngle(next.angle ?? 0);
  }

  // A new view from React (a new focus or size, or a gesture's end that changed it): glide to it
  // from the one shown. It runs on every choice too, not only a new key: a turn snapped to north
  // can come back to the very view React last drew, while the screen still shows it tilted.
  useLayoutEffect(() => {
    const frame = box.current;
    const element = svg.current;
    const turned = store.current;
    if (frame === null || element === null || turned === null || viewKey === '') return;
    // Whichever way this view is shown, a glide still running to an older one must not draw
    // over it.
    cancelAnimationFrame(glide.current);
    const to = viewOfKey(viewKey);
    const from = showing.current;
    showing.current = to;
    if (from === null || keyOf(from) === viewKey) return;
    if (filling || prefersReducedMotion()) {
      // No glide: show the new view at once. React may not have: a turn snapped to north is
      // an angle React already drew before the gesture, so it leaves the tilted one in place.
      drawView(frame, element, turned, to);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - started) / GLIDE_MS, 1);
      showing.current = glideView(from, to, t);
      drawView(frame, element, turned, showing.current);
      if (t < 1) glide.current = requestAnimationFrame(step);
    };
    drawView(frame, element, turned, from);
    // On screen until the first frame of the glide: a gesture started now starts from here.
    showing.current = from;
    glide.current = requestAnimationFrame(step);
  }, [viewKey, filling, chosen]);

  useLayoutEffect(() => () => cancelAnimationFrame(glide.current), []);

  if (view === null || size === null) return <div ref={box} className="store-map" />;

  const pixelsPerMetre = size.width / view.width;
  const metres = (pixels: number) => pixels / pixelsPerMetre;
  const legs = legsOf(route);
  const states = legStates(legs.length, current);
  const drawn = drawnAs(view);

  return (
    <div
      ref={box}
      className={filling ? 'store-map store-map--filling' : 'store-map'}
      style={{ [MAP_TURN]: drawn.turn, ...(filling && { '--legs': legs.length }) } as CSSProperties}
    >
      <svg
        ref={svg}
        viewBox={drawn.viewBox}
        role="img"
        aria-label={label}
        // Somewhere for focus to go when the north button it was on goes away: the map itself,
        // with its name.
        tabIndex={-1}
      >
        <g ref={store} transform={drawn.transform}>
          <g>
            {areas.areas.map((area) => (
              <path
                key={area.id}
                className={`store-map__area store-map__area--${area.kind}`}
                d={`${pathData(area.polygon)} Z`}
              />
            ))}
          </g>
          {showsLabels(pixelsPerMetre) && (
            <g>
              {areas.areas.map((area) => {
                if (area.label === undefined) return null;
                const [x, y] = labelPoint(area.polygon);
                return (
                  <text
                    key={area.id}
                    className="store-map__label"
                    x={x}
                    y={y}
                    fontSize={metres(LABEL_PX)}
                  >
                    {shortLabel(area.label)}
                  </text>
                );
              })}
            </g>
          )}
          <g>
            {drawOrder(states).map((index) => (
              <path
                key={index}
                className={`store-map__leg store-map__leg--${states[index]}`}
                d={pathData(legs[index]!)}
                // Filling: each leg is one unit long and drawn in its turn (map.css), its width in
                // metres, since a fixed screen width would turn the dashes into a dashed line.
                {...(filling && {
                  pathLength: 1,
                  // Inline, so it beats map.css's width in pixels.
                  style: { '--leg': index, strokeWidth: metres(LEG_PX) } as CSSProperties,
                })}
              />
            ))}
          </g>
          <g>
            {route.stops.map((stop, index) => (
              <g key={stop.nodeId}>
                <circle
                  className={`store-map__node--${states[index]}`}
                  cx={stop.x}
                  cy={stop.y}
                  r={metres(NODE_RADIUS_PX)}
                />
                <text
                  className="store-map__number"
                  x={stop.x}
                  y={stop.y}
                  fontSize={metres(NUMBER_PX)}
                >
                  {stop.order}
                </text>
              </g>
            ))}
          </g>
        </g>
      </svg>
      {drawn.turn !== 0 && (
        <CompassButton
          onNorth={() => {
            // The button goes away with the turn: focus moves to the map, not to the page.
            svg.current?.focus({ preventScroll: true });
            // Around the view's centre, so the same part of the store stays in the middle.
            choose({ ...view, angle: 0 });
          }}
        />
      )}
    </div>
  );
}

export default memo(StoreMap);
