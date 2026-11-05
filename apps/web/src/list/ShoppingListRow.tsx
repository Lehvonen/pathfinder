import { type ListEntry, MAX_QUANTITY } from './shoppingList';

type ShoppingListRowProps = {
  entry: ListEntry;
  onSetQuantity(id: string, quantity: number): void;
  onRemove(id: string): void;
};

/**
 * One item on the shopping list: its name, a − / + stepper for the amount and a remove
 * button. − stops at 1 and + at MAX_QUANTITY; taking the item off is "Poista".
 */
function ShoppingListRow({ entry, onSetQuantity, onRemove }: ShoppingListRowProps) {
  const { item, name } = entry;

  return (
    <li className="list-row">
      <span className="list-row__name">{name}</span>
      {/* Every row has the same three buttons; the name tells a screen reader which row. */}
      <span className="stepper" role="group" aria-label={`Määrä: ${name}`}>
        <button
          type="button"
          aria-label={`Vähennä: ${name}`}
          disabled={item.quantity <= 1}
          onClick={() => onSetQuantity(item.id, item.quantity - 1)}
        >
          −
        </button>
        <output className="stepper__value" aria-live="polite">
          {item.quantity}
        </output>
        <button
          type="button"
          aria-label={`Lisää yksi: ${name}`}
          disabled={item.quantity >= MAX_QUANTITY}
          onClick={() => onSetQuantity(item.id, item.quantity + 1)}
        >
          +
        </button>
      </span>
      <button
        type="button"
        aria-label={`Poista listalta: ${name}`}
        onClick={() => onRemove(item.id)}
      >
        Poista
      </button>
    </li>
  );
}

export default ShoppingListRow;
