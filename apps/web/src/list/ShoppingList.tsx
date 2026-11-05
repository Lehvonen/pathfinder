import type { ListEntry } from './shoppingList';
import ShoppingListRow from './ShoppingListRow';

type ShoppingListProps = {
  list: readonly ListEntry[];
  onSetQuantity(id: string, quantity: number): void;
  onRemove(id: string): void;
  onCalculateRoute(): void;
};

/**
 * The shopping list: a heading with the number of rows, one row per item, and
 * "Laske reitti" at the bottom. The button is disabled while the list is empty, since
 * there is nothing to route.
 */
function ShoppingList({ list, onSetQuantity, onRemove, onCalculateRoute }: ShoppingListProps) {
  return (
    <section className="shopping-list" aria-labelledby="shopping-list-title">
      <h2 id="shopping-list-title" className="shopping-list__title">
        Ostoslista ({list.length})
      </h2>
      {list.length === 0 ? (
        <p className="shopping-list__empty">Lista on tyhjä. Hae tuotteita ja lisää ne listalle.</p>
      ) : (
        <ul className="shopping-list__rows">
          {list.map((entry) => (
            <ShoppingListRow
              key={entry.item.id}
              entry={entry}
              onSetQuantity={onSetQuantity}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
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
