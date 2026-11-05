import { useId } from 'react';
import type { ListEntry } from '../list/listState';
import ShoppingListRow from '../list/ShoppingListRow';
import { useFocusOnMount } from './useFocusOnMount';

type ListEditPageProps = {
  list: readonly ListEntry[];
  onSetQuantity(id: string, quantity: number): void;
  onRemove(id: string): void;
  /** Unticks an item picked on the shopping screen (see ShoppingListRow). */
  onUntick?(id: string): void;
  /** Back to search, to add more; the list is kept. */
  onAddMore(): void;
  /** Back to the route, planned again for the list as it is now. */
  onBack(): void;
};

/**
 * "Muokkaa listaa" from the route overview (docs/plans/route-map.md): every item with its
 * − / + amount and "Poista", and "+ Lisää tuotteita" back to search. "← Takaisin reittiin"
 * plans the route again, so removed items drop out of it.
 */
function ListEditPage(props: ListEditPageProps) {
  const { list, onSetQuantity, onRemove, onUntick, onAddMore, onBack } = props;
  const titleId = useId();
  const title = useFocusOnMount<HTMLHeadingElement>();

  return (
    <section className="route-page" aria-labelledby={titleId}>
      <header className="route-page__header">
        <button type="button" onClick={onBack}>
          ← Takaisin reittiin
        </button>
        <h2 id={titleId} ref={title} tabIndex={-1}>
          Muokkaa listaa
        </h2>
      </header>
      {list.length === 0 ? (
        <p className="route-page__message">Lista on tyhjä.</p>
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
      <button type="button" className="list-edit__add" onClick={onAddMore}>
        + Lisää tuotteita
      </button>
    </section>
  );
}

export default ListEditPage;
