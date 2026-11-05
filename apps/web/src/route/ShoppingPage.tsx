import type { Route } from '@pathfinder/core';
import { useId } from 'react';
import StoreMap from '../map/StoreMap';
import type { MapAreas } from './loadRoutingData';
import { distanceLeft, legFocus, stopsDone } from './progress';
import { formatDistance, placeName } from './routeView';
import ShoppingSheet from './ShoppingSheet';
import { useFocusOnMount } from './useFocusOnMount';

type ShoppingPageProps = {
  /** The route as planned when "Aloita ostokset" was pressed; ticks don't change it. */
  route: Route;
  names: ReadonlyMap<string, string>;
  areas: MapAreas;
  /** Ids of the items ticked on the list. */
  ticked: ReadonlySet<string>;
  onTick(id: string, ticked: boolean): void;
  onBack(): void;
  onFinish(): void;
};

/**
 * The shopping screen (docs/plans/route-map.md §5): "← Takaisin" and where the shopper is
 * along the route, the map in about 70 % zoomed to the leg to the next stop, and the sheet
 * with that stop's items. Ticking every item at a stop moves the route on: the map zooms to
 * the next leg, walked legs stay deep green, those ahead light green.
 */
function ShoppingPage(props: ShoppingPageProps) {
  const { route, names, areas, ticked, onTick, onBack, onFinish } = props;
  const titleId = useId();
  const title = useFocusOnMount<HTMLHeadingElement>();
  const done = stopsDone(route, ticked);
  const next = route.stops[done];
  const where =
    next === undefined
      ? `Kassalle: ${placeName(route.end.nodeId, areas)}`
      : `Pysähdys ${next.order}/${route.stops.length}: ${placeName(next.nodeId, areas)}`;

  return (
    <section className="shopping" aria-labelledby={titleId}>
      <header className="shopping__header">
        <button type="button" onClick={onBack}>
          ← Takaisin
        </button>
        <h2 id={titleId} ref={title} tabIndex={-1} className="visually-hidden">
          Ostokset
        </h2>
        <p className="shopping__progress" aria-live="polite">
          {where} · {formatDistance(distanceLeft(route, done))} jäljellä
        </p>
      </header>
      <div className="shopping__map">
        <StoreMap
          areas={areas}
          route={route}
          current={done}
          focus={legFocus(route, done)}
          label={`Kartta: reitti seuraavaan pysähdykseen. ${where}`}
        />
      </div>
      <ShoppingSheet
        route={route}
        done={done}
        ticked={ticked}
        names={names}
        areas={areas}
        onTick={onTick}
        onFinish={onFinish}
      />
    </section>
  );
}

export default ShoppingPage;
