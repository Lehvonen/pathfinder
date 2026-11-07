import { useId } from 'react';
import type { NamedItem } from '../list/listStorage';
import SuggestionRow from './SuggestionRow';

type SuggestionsProps = {
  /** From `suggestions()`; may be empty, and the controls still show. */
  things: readonly NamedItem[];
  onAdd(thing: NamedItem): void;
  /** "Unohda ostohistoria". */
  onForget(): void;
  /** "Älä muista". */
  onStop(): void;
};

/** A key for a suggestion: two things can share a name, never an EAN or a word in a category. */
const keyOf = ({ item }: NamedItem) =>
  item.kind === 'product' ? item.ean : `${item.categoryId}:${item.label}`;

/**
 * On search with the box empty, while the history is on (docs/plans/device-storage.md §3–4):
 * "Usein ostamasi" when there is something to suggest, and always the line saying the
 * history is on, with the two ways to delete it. Withdrawing is never hidden.
 */
function Suggestions({ things, onAdd, onForget, onStop }: SuggestionsProps) {
  const headingId = useId();

  return (
    <section className="suggestions" aria-label="Ostohistoria">
      {things.length > 0 && (
        <>
          <h2 id={headingId} className="suggestions__heading">
            Usein ostamasi
          </h2>
          <ul className="search-results" aria-labelledby={headingId}>
            {things.map((thing) => (
              <SuggestionRow key={keyOf(thing)} thing={thing} onAdd={onAdd} />
            ))}
          </ul>
        </>
      )}
      <p className="suggestions__status">
        Ostohistoria on päällä. Tiedot pysyvät vain tällä laitteella.
      </p>
      <div className="suggestions__controls">
        <button type="button" onClick={onForget}>
          Unohda ostohistoria
        </button>
        <button type="button" onClick={onStop}>
          Älä muista
        </button>
      </div>
    </section>
  );
}

export default Suggestions;
