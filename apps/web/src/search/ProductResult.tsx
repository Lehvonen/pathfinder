import type { MatchTerm, ProductHit } from '@pathfinder/search';
import { highlightRanges, splitByRanges } from './highlight';

type ProductResultProps = {
  product: ProductHit;
  /** What the query matched on, so the name can show why this product is here. */
  terms: readonly MatchTerm[];
  onAdd(product: ProductHit): void;
};

/** One product in the results: its name with the match marked, and an add button. */
function ProductResult({ product, terms, onAdd }: ProductResultProps) {
  const segments = splitByRanges(product.name, highlightRanges(product.name, terms));

  return (
    <li className="product-result">
      <span className="product-result__name">
        {segments.map((segment, i) =>
          segment.match ? <mark key={i}>{segment.text}</mark> : segment.text,
        )}
      </span>
      {/* Twenty "Lisää" buttons are indistinguishable to a screen reader without the name. */}
      <button type="button" aria-label={`Lisää ${product.name}`} onClick={() => onAdd(product)}>
        Lisää
      </button>
    </li>
  );
}

export default ProductResult;
