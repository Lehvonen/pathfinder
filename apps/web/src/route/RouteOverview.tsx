import { useEffect, useId, useRef } from 'react';
import { boundsOf, legsOf } from '../map/mapView';
import StoreMap from '../map/StoreMap';
import {
  chosenRoute,
  formatDistance,
  formatMinutes,
  formatStops,
  itemName,
  nextEntrance,
  placeName,
  type RouteView,
} from './routeView';

type RouteOverviewProps = {
  view: RouteView;
  /** The entrance chosen to start from; null for the default, entrance 1. */
  start: string | null;
  onChangeStart(start: string): void;
  onEditList(): void;
  onBack(): void;
  /** Loads the routing data again after a failed load. */
  onRetry(): void;
  /** Starts the shop; the button is left out while this is not given. */
  onStartShopping?(): void;
};

/**
 * The whole route at a glance, shown when "Laske reitti" is pressed (docs/plans/route-map.md):
 * the summary, the map with the route, where to start, and what to do next: start
 * shopping, edit the list, or start from the other entrance. Every entrance's route is
 * planned already, so switching is instant. A message stands in for the route when there is
 * none, with "Yritä uudelleen" when trying again could help.
 *
 * Focus moves to the heading when the screen opens, so a screen reader announces "Reitti".
 */
function RouteOverview(props: RouteOverviewProps) {
  const { view, start, onChangeStart, onEditList, onBack, onRetry, onStartShopping } = props;
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
  }, []);

  const header = (
    <header className="route-page__header">
      <button type="button" onClick={onBack}>
        ← Takaisin
      </button>
      <h2 id={titleId} ref={title} tabIndex={-1}>
        Reitti
      </h2>
    </header>
  );

  if (view.kind === 'message') {
    return (
      <section className="route-page" aria-labelledby={titleId}>
        {header}
        <p className="route-page__message" role="alert">
          {view.text}
        </p>
        {view.canRetry && (
          <button type="button" onClick={onRetry}>
            Yritä uudelleen
          </button>
        )}
      </section>
    );
  }

  const chosen = chosenRoute(view, start);
  const { route, unplaced } = chosen.result;
  const other = nextEntrance(view, chosen.start);
  return (
    <section className="route-page" aria-labelledby={titleId}>
      {header}
      <p className="route-page__summary">
        {formatStops(route.stops.length)} · {formatDistance(route.totalDistance)} ·{' '}
        {formatMinutes(route.estimatedMinutes)}
      </p>
      <div className="route-overview__map">
        <StoreMap
          areas={view.areas}
          route={route}
          current={0}
          focus={boundsOf(legsOf(route).flat())}
          label={`Kartta: reitti, ${formatStops(route.stops.length)}`}
        />
      </div>
      <p className="route-overview__start">
        Aloita: <strong>{placeName(chosen.start, view.areas)}</strong>
      </p>
      {unplaced.length > 0 && (
        <section className="route-page__unplaced">
          <h3>Ei reitillä: paikkaa ei löytynyt</h3>
          <ul>
            {unplaced.map((item) => (
              <li key={item.id}>{itemName(item, view.names)}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="route-overview__actions">
        {onStartShopping && (
          <button type="button" className="route-overview__primary" onClick={onStartShopping}>
            Aloita ostokset
          </button>
        )}
        <button type="button" onClick={onEditList}>
          Muokkaa listaa
        </button>
        {other !== chosen.start && (
          <button type="button" onClick={() => onChangeStart(other)}>
            Vaihda aloituspaikka: {placeName(other, view.areas)}
          </button>
        )}
      </div>
    </section>
  );
}

export default RouteOverview;
