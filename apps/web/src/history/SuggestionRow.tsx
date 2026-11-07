import type { NamedItem } from '../list/listStorage';

type SuggestionRowProps = {
  thing: NamedItem;
  onAdd(thing: NamedItem): void;
};

/** One suggestion: its name and "Lisää", styled like a search result. */
function SuggestionRow({ thing, onAdd }: SuggestionRowProps) {
  return (
    <li className="product-result">
      <span className="product-result__name">{thing.name}</span>
      {/* Eight "Lisää" buttons are indistinguishable to a screen reader without the name. */}
      <button type="button" aria-label={`Lisää ${thing.name}`} onClick={() => onAdd(thing)}>
        Lisää
      </button>
    </li>
  );
}

export default SuggestionRow;
