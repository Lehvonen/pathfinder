import { useId } from 'react';
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
 */
function RoutePage({ view, onBack }: RoutePageProps) {
  const titleId = useId();

  return (
    <section className="route-page" aria-labelledby={titleId}>
      <header className="route-page__header">
        <button type="button" onClick={onBack}>
          ← Takaisin
        </button>
        <h2 id={titleId}>Reitti</h2>
      </header>

      {view.kind === 'message' ? (
        <p className="route-page__message" role="alert">
          {view.text}
        </p>
      ) : (
        <>
          <p className="route-page__summary">
            {formatStops(view.result.route.stops.length)} ·{' '}
            {formatDistance(view.result.route.totalDistance)} ·{' '}
            {formatMinutes(view.result.route.estimatedMinutes)}
          </p>
          <p className="route-page__end">
            Aloita: <strong>{placeName(view.result.route.start.nodeId, view.areas)}</strong>
          </p>
          <ol className="route-page__stops">
            {view.result.route.stops.map((stop) => (
              <RouteStopRow
                key={stop.nodeId}
                stop={stop}
                place={placeName(stop.nodeId, view.areas)}
                names={view.names}
              />
            ))}
          </ol>
          <p className="route-page__end">
            Lopuksi: <strong>{placeName(view.result.route.end.nodeId, view.areas)}</strong> (+
            {formatDistance(view.result.route.end.legDistance)})
          </p>
          {view.result.unplaced.length > 0 && (
            <section className="route-page__unplaced">
              <h3>Ei reitillä: paikkaa ei löytynyt</h3>
              <ul>
                {view.result.unplaced.map((item) => (
                  <li key={item.id}>{itemName(item, view.names)}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}

export default RoutePage;
