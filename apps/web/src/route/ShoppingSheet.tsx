import type { ListItem, Route } from '@pathfinder/core';
import { useEffect, useRef, useState } from 'react';
import { itemName, placeName } from './routeView';
import type { MapAreas } from './loadRoutingData';
import TickItem from './TickItem';

type ShoppingSheetProps = {
  route: Route;
  /** How many stops are done (`stopsDone`). */
  done: number;
  ticked: ReadonlySet<string>;
  names: ReadonlyMap<string, string>;
  areas: MapAreas;
  onTick(id: string, ticked: boolean): void;
  onFinish(): void;
  /** Items the route could not place; listed in the open sheet, so it is the whole list. */
  unplaced?: readonly ListItem[];
};

/**
 * The sheet over the bottom of the shopping screen (docs/plans/route-map.md §5). Closed, it
 * shows the current stop's items, each with a tick; the route moves on once all are ticked.
 * Its heading opens it over most of the screen with every stop, scrollable, so items can be
 * ticked or unticked anywhere. Once every stop is done it says so and offers "Lopeta
 * ostokset". Opened by a tap for now; dragging comes with the gestures (PR C).
 *
 * When a stop is done while the sheet is closed, focus moves to the next stop's heading (or
 * to "Kaikki kerätty"): the ticked button has just left the screen, and focus would otherwise
 * drop to the page. Open, the button stays on screen, so focus stays on it.
 */
function ShoppingSheet(props: ShoppingSheetProps) {
  const { route, done, ticked, names, areas, onTick, onFinish, unplaced = [] } = props;
  const [open, setOpen] = useState(false);
  const allDone = done >= route.stops.length;
  const shown = open ? route.stops : route.stops.slice(done, done + 1);
  const nextStopHeading = useRef<HTMLHeadingElement>(null);
  const doneNote = useRef<HTMLParagraphElement>(null);
  const lastDone = useRef(done);

  useEffect(() => {
    if (lastDone.current === done) return;
    lastDone.current = done;
    // Open, the pressed button is still on screen: leave focus on it.
    if (open) return;
    (allDone ? doneNote : nextStopHeading).current?.focus();
  }, [done, allDone, open]);

  return (
    <section
      className={open ? 'shopping-sheet shopping-sheet--open' : 'shopping-sheet'}
      aria-label="Kerättävät"
    >
      <button
        type="button"
        className="shopping-sheet__toggle"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span>{open ? 'Koko lista' : allDone ? 'Kaikki kerätty' : 'Seuraavaksi'}</span>
        <span aria-hidden="true">{open ? '▼' : '▲'}</span>
      </button>
      <div className="shopping-sheet__body">
        {allDone && (
          <>
            <p ref={doneNote} tabIndex={-1} className="shopping-sheet__done">
              Kaikki kerätty – kassalle!
            </p>
            <button type="button" className="shopping-sheet__finish" onClick={onFinish}>
              Lopeta ostokset
            </button>
          </>
        )}
        {shown.map((stop) => {
          const index = stop.order - 1;
          const stopDone = index < done;
          return (
            <section key={stop.nodeId}>
              <h3
                ref={index === done ? nextStopHeading : undefined}
                tabIndex={-1}
                className={
                  stopDone
                    ? 'shopping-sheet__stop shopping-sheet__stop--done'
                    : 'shopping-sheet__stop'
                }
              >
                {stop.order}. {placeName(stop.nodeId, areas)}
              </h3>
              <ul className="shopping-sheet__items">
                {stop.items.map((item) => (
                  <TickItem
                    key={item.id}
                    item={item}
                    name={itemName(item, names)}
                    ticked={ticked.has(item.id)}
                    onTick={onTick}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        {open && unplaced.length > 0 && (
          <section className="route-page__unplaced">
            <h3>Ei reitillä: paikkaa ei löytynyt</h3>
            <ul>
              {unplaced.map((item) => (
                <li key={item.id}>{itemName(item, names)}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

export default ShoppingSheet;
