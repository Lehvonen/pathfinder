import { useId, useRef } from 'react';
import { thingKey } from '../list/listState';
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

/**
 * On search with the box empty, while the history is on (docs/plans/device-storage.md §3–4):
 * "Usein ostamasi" when there is something to suggest, and always the line saying the
 * history is on, with the two ways to delete it. Withdrawing is never hidden. "Lisää" and
 * "Unohda ostohistoria" remove what was pressed, so focus moves to the status line, which
 * stays; "Älä muista" removes the whole section, and `App.tsx` announces it.
 */
function Suggestions({ things, onAdd, onForget, onStop }: SuggestionsProps) {
  const headingId = useId();
  const status = useRef<HTMLParagraphElement>(null);
  const add = (thing: NamedItem) => {
    onAdd(thing);
    status.current?.focus();
  };
  const forget = () => {
    onForget();
    status.current?.focus();
  };

  return (
    <section className="suggestions" aria-label="Ostohistoria">
      {things.length > 0 && (
        <>
          <h2 id={headingId} className="suggestions__heading">
            Usein ostamasi
          </h2>
          <ul className="search-results" aria-labelledby={headingId}>
            {things.map((thing) => (
              <SuggestionRow key={thingKey(thing.item)} thing={thing} onAdd={add} />
            ))}
          </ul>
        </>
      )}
      <p className="suggestions__status" ref={status} tabIndex={-1}>
        Ostohistoria on päällä. Tiedot pysyvät vain tällä laitteella.
      </p>
      <div className="suggestions__controls">
        <button type="button" onClick={forget}>
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
