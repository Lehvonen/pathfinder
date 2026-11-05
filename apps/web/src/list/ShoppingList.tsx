import { useState } from 'react';
import type { ListEntry } from './listState';
import ShoppingListRow from './ShoppingListRow';

type ShoppingListProps = {
  list: readonly ListEntry[];
  onSetQuantity(id: string, quantity: number): void;
  onRemove(id: string): void;
  /** Unticks an item picked on the shopping screen (see ShoppingListRow). */
  onUntick?(id: string): void;
  onCalculateRoute(): void;
};

/**
 * The shopping list, a panel at the bottom of the search screen and its category pages (the
 * route screens replace it). Its heading, "Ostoslista (n)", is the button that opens and
 * closes the rows; it starts closed, so the search results get the screen. "Laske reitti"
 * shows either way, disabled while the list is empty, since there is nothing to route.
 */
function ShoppingList(props: ShoppingListProps) {
  const { list, onSetQuantity, onRemove, onUntick, onCalculateRoute } = props;
  const [open, setOpen] = useState(false);

  return (
    <section className="shopping-list" aria-labelledby="shopping-list-title">
      {/* A button inside the heading: still a heading to jump to, and says open or closed. */}
      <h2 id="shopping-list-title" className="shopping-list__title">
        <button
          type="button"
          className="shopping-list__toggle"
          aria-expanded={open}
          aria-controls="shopping-list-body"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span className="shopping-list__arrow" aria-hidden="true">
            {open ? '▼' : '▲'}
          </span>
          Ostoslista ({list.length})
        </button>
      </h2>
      <div id="shopping-list-body" className="shopping-list__body" hidden={!open}>
        {list.length === 0 ? (
          <p className="shopping-list__empty">
            Lista on tyhjä. Hae tuotteita ja lisää ne listalle.
          </p>
        ) : (
          <ul className="shopping-list__rows">
            {list.map((entry) => (
              <ShoppingListRow
                key={entry.item.id}
                entry={entry}
                onSetQuantity={onSetQuantity}
                onRemove={onRemove}
                onUntick={onUntick}
              />
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="shopping-list__route"
        disabled={list.length === 0}
        onClick={onCalculateRoute}
      >
        Laske reitti
      </button>
    </section>
  );
}

export default ShoppingList;
