import { useId } from 'react';

type RememberOfferProps = {
  /** "Kyllä" or "Ei kiitos". */
  onAnswer(consent: 'yes' | 'no'): void;
};

/**
 * The question on the finish card, shown until it is answered
 * (docs/plans/device-storage.md §3). Both answers are the same size and weight: saying no
 * is as easy as saying yes.
 */
function RememberOffer({ onAnswer }: RememberOfferProps) {
  const textId = useId();

  return (
    <div className="remember-offer" role="group" aria-labelledby={textId}>
      <p id={textId}>
        Muistetaanko ostoksesi? Ehdotamme niitä seuraavalla kerralla. Tiedot pysyvät vain tällä
        laitteella.
      </p>
      <div className="remember-offer__answers">
        <button type="button" onClick={() => onAnswer('yes')}>
          Kyllä
        </button>
        <button type="button" onClick={() => onAnswer('no')}>
          Ei kiitos
        </button>
      </div>
    </div>
  );
}

export default RememberOffer;
