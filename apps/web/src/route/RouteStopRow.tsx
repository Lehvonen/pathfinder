import type { RouteStop } from '@pathfinder/core';
import { formatDistance, itemName } from './routeView';

type RouteStopRowProps = {
  stop: RouteStop;
  /** Where the stop is, as the store's map names it. */
  place: string;
  /** Each list item's name, by item id; a product item holds only its EAN. */
  names: ReadonlyMap<string, string>;
};

/**
 * One stop on the route: its number, the place, the walk from the last stop ("45 m
 * edellisestä", from the entrance for the first), its items.
 */
function RouteStopRow({ stop, place, names }: RouteStopRowProps) {
  return (
    <li className="route-stop">
      <span className="route-stop__number" aria-hidden="true">
        {stop.order}
      </span>
      <div className="route-stop__body">
        <h3 className="route-stop__place">
          <span className="visually-hidden">{stop.order}. </span>
          {place}
        </h3>
        <span className="route-stop__walk">{formatDistance(stop.legDistance)} edellisestä</span>
        <ul className="route-stop__items">
          {stop.items.map((item) => (
            <li key={item.id}>
              {itemName(item, names)}
              {item.quantity > 1 && ` × ${item.quantity}`}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export default RouteStopRow;
