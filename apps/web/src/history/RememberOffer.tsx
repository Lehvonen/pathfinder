import { useEffect, useId, useRef, useState } from 'react';
import type { Consent } from './history';

type RememberOfferProps = {
  /** The answer so far; null until the shopper answers. */
  consent: Consent;
  /** "Kyllä" or "Ei kiitos". */
  onAnswer(consent: 'yes' | 'no'): void;
};

/** What the card says once answered, in place of the question. */
const CONFIRMATION = {
  yes: 'Selvä, muistetaan. Ehdotukset näkyvät hakusivulla, ja siellä voit myös poistaa ne.',
  no: 'Selvä, ostoksiasi ei muisteta. Mitään ei tallenneta tälle laitteelle.',
} as const;

/**
 * The question on the finish card (docs/plans/device-storage.md §3). Both answers are the
 * same size and weight: saying no is as easy as saying yes. Once answered, the question
 * turns into a confirmation that takes focus, and the buttons are hidden but keep their
 * room, so "Valmis" never moves under a second tap.
 */
function RememberOffer({ consent, onAnswer }: RememberOfferProps) {
  const textId = useId();
  const confirmation = useRef<HTMLParagraphElement>(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (answered) confirmation.current?.focus();
  }, [answered]);

  const answer = (next: 'yes' | 'no') => {
    setAnswered(true);
    onAnswer(next);
  };

  return (
    <div className="remember-offer" role="group" aria-labelledby={textId}>
      {consent === null ? (
        <p id={textId}>
          Muistetaanko ostoksesi? Ehdotamme niitä seuraavalla kerralla. Tiedot pysyvät vain tällä
          laitteella.
        </p>
      ) : (
        <p id={textId} ref={confirmation} role="status" tabIndex={-1}>
          {CONFIRMATION[consent]}
        </p>
      )}
      <div
        className={`remember-offer__answers${consent === null ? '' : ' remember-offer__answers--done'}`}
      >
        <button type="button" onClick={() => answer('yes')}>
          Kyllä
        </button>
        <button type="button" onClick={() => answer('no')}>
          Ei kiitos
        </button>
      </div>
    </div>
  );
}

export default RememberOffer;
