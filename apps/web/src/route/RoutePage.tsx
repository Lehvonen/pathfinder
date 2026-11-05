import { useEffect, useId, useRef } from 'react';
import RouteStopRow from './RouteStopRow';
import {
  formatDistance,
  formatMinutes,
  formatStops,
  itemName,
  placeName,
  type RouteView,
} from './routeView';

type RoutePageProps = {
  view: RouteView;
  onBack(): void;
};

/**
 * The route for the list as it was when "Laske reitti" was pressed (docs/plans/routing.md
 * §4): a summary, the entrance, the numbered stops with their items, the checkout, and
 * anything that could not be placed. A message stands in for all of it when there is no
 * route. Editing the list afterwards does not change it; pressing the button again does.
 *
 * Focus moves to the heading when the page opens, so a screen reader announces "Reitti"
 * rather than staying on the button in the list panel.
 */
function RoutePage({ view, onBack }: RoutePageProps) {
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
      </section>
    );
  }

  const { route, unplaced } = view.result;
  const { names, areas } = view;
  return (
    <section className="route-page" aria-labelledby={titleId}>
      {header}
      <p className="route-page__summary">
        {formatStops(route.stops.length)} · {formatDistance(route.totalDistance)} ·{' '}
        {formatMinutes(route.estimatedMinutes)}
      </p>
      <p className="route-page__end">
        Aloita: <strong>{placeName(route.start.nodeId, areas)}</strong>
      </p>
      <ol className="route-page__stops">
        {route.stops.map((stop) => (
          <RouteStopRow
            key={stop.nodeId}
            stop={stop}
            place={placeName(stop.nodeId, areas)}
            names={names}
          />
        ))}
      </ol>
      <p className="route-page__end">
        Lopuksi: <strong>{placeName(route.end.nodeId, areas)}</strong> (
        {formatDistance(route.end.legDistance)} edellisestä)
      </p>
      {unplaced.length > 0 && (
        <section className="route-page__unplaced">
          <h3>Ei reitillä: paikkaa ei löytynyt</h3>
          <ul>
            {unplaced.map((item) => (
              <li key={item.id}>{itemName(item, names)}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

export default RoutePage;
