import type { Route } from '@pathfinder/core';
import { useLayoutEffect, useRef, useState } from 'react';
import type { MapAreas } from '../route/loadRoutingData';
import {
  fitView,
  LABEL_MIN_PIXELS_PER_METRE,
  labelPoint,
  legsOf,
  legStates,
  pathData,
  shortLabel,
  type LegState,
  type ViewBox,
} from './mapView';

type StoreMapProps = {
  areas: MapAreas;
  route: Route;
  /** How many stops are done; decides which leg is next (`legStates`). */
  current: number;
  /** The part of the store to fit on screen, in metres. */
  focus: ViewBox;
  /** What the map shows, for a screen reader: the SVG itself says nothing. */
  label: string;
};

/** Sizes on screen, in pixels, whatever the zoom. */
const NODE_RADIUS_PX = 10;
const NUMBER_PX = 12;
const LABEL_PX = 11;
const PADDING_M = 4;

/** Drawn first to last, so the next leg is never hidden under the others. */
const DRAW_ORDER: Record<LegState, number> = { ahead: 0, walked: 1, next: 2 };

/**
 * The store map with the route on it: the areas as grey shapes, their names once zoomed in
 * far enough to fit, the route as a green line in three states, and a numbered node at each
 * stop. It fills its container and fits `focus` into it; it measures itself, so it redraws
 * only when its size changes.
 */
function StoreMap({ areas, route, current, focus, label }: StoreMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const view =
    size !== null && size.height > 0
      ? fitView(focus, size.width / size.height, PADDING_M)
      : fitView(focus, 1, PADDING_M);
  const pixelsPerMetre = size !== null ? size.width / view.width : 1;
  const metres = (pixels: number) => pixels / pixelsPerMetre;

  const legs = legsOf(route);
  const states = legStates(legs.length, current);
  const drawn = legs
    .map((points, index) => ({ points, index, state: states[index]! }))
    .sort((a, b) => DRAW_ORDER[a.state] - DRAW_ORDER[b.state]);

  return (
    <div ref={box} className="store-map">
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
        {pixelsPerMetre >= LABEL_MIN_PIXELS_PER_METRE && (
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
          {drawn.map(({ points, index, state }) => (
            <path
              key={index}
              className={`store-map__leg store-map__leg--${state}`}
              d={pathData(points)}
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

export default StoreMap;
