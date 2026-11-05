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
  type ScreenSize,
  type ViewBox,
} from './mapView';
import { glideView, viewBoxAttribute } from './panZoom';
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

/**
 * The store map with the route on it: the areas as grey shapes, their names once zoomed in
 * far enough to fit, the route as a green line in three states, and a numbered node at each
 * stop. It fills its container and fits `focus` into it. It measures itself first and draws
 * nothing until then; after that it redraws only when its size or its props change (`memo`).
 *
 * Pinch, pan and the mouse wheel move the view (`usePanZoom`), changing the SVG directly with
 * no redraw until the gesture ends. The view the shopper chose holds until `focus` changes;
 * then the map glides to the new focus in GLIDE_MS (at once with reduced motion).
 */
function StoreMap({ areas, route, current, focus, label, filling = false }: StoreMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<ScreenSize | null>(null);
  // The view a gesture ended on, for the focus it was made on: a new focus drops it.
  const [chosen, setChosen] = useState<{ focus: ViewBox; view: ViewBox } | null>(null);
  /** The view the SVG shows now, whoever set it: React, a gesture or the glide. */
  const showing = useRef<ViewBox | null>(null);
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

  const fitted = screenView(focus, size);
  const view = chosen !== null && chosen.focus === focus ? chosen.view : (fitted?.view ?? null);
  const viewKey = view === null ? '' : viewBoxAttribute(view);

  usePanZoom({
    target: box,
    state: view === null || size === null ? null : { view, size, store: storeBounds(areas) },
    onFrame: (next) => {
      cancelAnimationFrame(glide.current);
      showing.current = next;
      svg.current?.setAttribute('viewBox', viewBoxAttribute(next));
    },
    onEnd: (next) => setChosen({ focus, view: next }),
  });

  // A new view from React (a new focus or size, not a gesture): glide to it from the one shown.
  useLayoutEffect(() => {
    const element = svg.current;
    if (element === null || viewKey === '') return;
    const [x, y, width, height] = viewKey.split(' ').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const to = { x, y, width, height };
    const from = showing.current;
    showing.current = to;
    if (from === null || viewBoxAttribute(from) === viewKey || filling || prefersReducedMotion()) {
      return;
    }
    cancelAnimationFrame(glide.current);
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - started) / GLIDE_MS, 1);
      showing.current = glideView(from, to, t);
      element.setAttribute('viewBox', viewBoxAttribute(showing.current));
      if (t < 1) glide.current = requestAnimationFrame(step);
    };
    element.setAttribute('viewBox', viewBoxAttribute(from));
    glide.current = requestAnimationFrame(step);
  }, [viewKey, filling]);

  useLayoutEffect(() => () => cancelAnimationFrame(glide.current), []);

  if (view === null || size === null) return <div ref={box} className="store-map" />;

  const pixelsPerMetre = size.width / view.width;
  const metres = (pixels: number) => pixels / pixelsPerMetre;
  const legs = legsOf(route);
  const states = legStates(legs.length, current);

  return (
    <div
      ref={box}
      className={filling ? 'store-map store-map--filling' : 'store-map'}
      style={filling ? ({ '--legs': legs.length } as CSSProperties) : undefined}
    >
      <svg ref={svg} viewBox={viewKey} role="img" aria-label={label}>
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
      </svg>
    </div>
  );
}

export default memo(StoreMap);
