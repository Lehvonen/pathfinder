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
  type ScreenSize,
  type ViewBox,
} from './mapView';

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

/**
 * The store map with the route on it: the areas as grey shapes, their names once zoomed in
 * far enough to fit, the route as a green line in three states, and a numbered node at each
 * stop. It fills its container and fits `focus` into it. It measures itself first and draws
 * nothing until then; after that it redraws only when its size or its props change (`memo`).
 */
function StoreMap({ areas, route, current, focus, label, filling = false }: StoreMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ScreenSize | null>(null);

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

  const shown = screenView(focus, size);
  if (shown === null) return <div ref={box} className="store-map" />;

  const { view, pixelsPerMetre } = shown;
  const metres = (pixels: number) => pixels / pixelsPerMetre;
  const legs = legsOf(route);
  const states = legStates(legs.length, current);

  return (
    <div ref={box} className={filling ? 'store-map store-map--filling' : 'store-map'}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="img"
        aria-label={label}
      >
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
              // Filling: each leg is drawn as one unit of length, in its turn (map.css).
              {...(filling && { pathLength: 1, style: { '--leg': index } as CSSProperties })}
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
