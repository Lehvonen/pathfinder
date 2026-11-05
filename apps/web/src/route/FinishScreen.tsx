import type { Route } from '@pathfinder/core';
import { useId, type CSSProperties } from 'react';
import { legsOf, routeFocus } from '../map/mapView';
import StoreMap from '../map/StoreMap';
import type { MapAreas } from './loadRoutingData';
import { formatElapsed } from './progress';
import { formatDistance } from './routeView';
import { useFocusOnMount } from './useFocusOnMount';

type FinishScreenProps = {
  route: Route;
  areas: MapAreas;
  /** From the first "Aloita ostokset" to "Lopeta ostokset", re-plans included. */
  elapsedMs: number;
  /** Every item ticked on the list, each counted by its amount (`pickedCount`). */
  picked: number;
  /** "Valmis": back to search with an empty list. */
  onDone(): void;
};

const CONFETTI_COLOURS = ['var(--route-deep)', 'var(--route-light)', '#5cb85c', '#0f5c27'];

/** 30 pieces, spread across the screen with a fixed pattern: the same every time, no lag. */
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  '--x': `${(i * 37) % 100}%`,
  '--delay': `${((i * 53) % 40) / 100}s`,
  '--spin': `${((i * 71) % 4) * 180 - 270}deg`,
  '--colour': CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
})) as CSSProperties[];

/**
 * The end of the shop (docs/plans/route-map.md §5): the whole route on the map, its legs
 * drawn in deep green one after another from the start to the checkout; then a card with
 * the trip in numbers and a short green confetti burst. None of the motion plays when the
 * phone asks for reduced motion.
 */
function FinishScreen({ route, areas, elapsedMs, picked, onDone }: FinishScreenProps) {
  const titleId = useId();
  const title = useFocusOnMount<HTMLHeadingElement>();

  return (
    <section className="shopping" aria-labelledby={titleId}>
      <div />
      <div className="shopping__map">
        <StoreMap
          areas={areas}
          route={route}
          current={legsOf(route).length}
          focus={routeFocus(route)}
          label="Kartta: koko reitti kuljettu"
          filling
        />
      </div>
      <div />
      <div className="finish">
        {CONFETTI.map((style, i) => (
          <span key={i} className="finish__confetti" style={style} aria-hidden="true" />
        ))}
        <div className="finish__card">
          <h2 id={titleId} ref={title} tabIndex={-1}>
            Valmis!
          </h2>
          <p>
            {picked} tuotetta · {formatDistance(route.totalDistance)} · aikaa kului{' '}
            {formatElapsed(elapsedMs)}
          </p>
          <button type="button" onClick={onDone}>
            Valmis
          </button>
        </div>
      </div>
    </section>
  );
}

export default FinishScreen;
