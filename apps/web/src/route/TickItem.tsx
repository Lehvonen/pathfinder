import type { ListItem } from '@pathfinder/core';

type TickItemProps = {
  item: ListItem;
  /** The item's name as the list shows it. */
  name: string;
  ticked: boolean;
  onTick(id: string, ticked: boolean): void;
};

/**
 * One item on the shopping screen: a round tick button, then its name and amount. A tick
 * marks it picked up; tapping again unticks it. Ticked, the name is struck through.
 */
function TickItem({ item, name, ticked, onTick }: TickItemProps) {
  return (
    <li className={ticked ? 'tick-item tick-item--ticked' : 'tick-item'}>
      <button
        type="button"
        className="tick-item__button"
        aria-pressed={ticked}
        aria-label={`Kerätty: ${name}`}
        onClick={() => onTick(item.id, !ticked)}
      >
        {ticked ? '✓' : ''}
      </button>
      <span className="tick-item__name">
        {name}
        {item.quantity > 1 && ` × ${item.quantity}`}
      </span>
    </li>
  );
}

export default TickItem;
