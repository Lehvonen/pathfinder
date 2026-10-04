import type { Category } from '@pathfinder/core';
import type { ProductHit, SearchResponse } from '@pathfinder/search';
import CategoryResult from './CategoryResult';
import ProductResult from './ProductResult';

type SearchResultsProps = {
  /** `null` until tier 1 is searchable. */
  response: SearchResponse | null;
  /** What is typed right now; the response may still be for an earlier keystroke. */
  query: string;
  error: Error | null;
  canShowMore: boolean;
  onShowMore(): void;
  onAddProduct(product: ProductHit): void;
  onAddGeneric(category: Category, label: string): void;
  onBrowse(category: Category): void;
};

/**
 * Categories first, then products, then "show more". The loading and empty states are
 * quiet notes, not errors (ARCHITECTURE.md §11); notes are announced politely so a screen
 * reader is not interrupted on every keystroke.
 */
function SearchResults(props: SearchResultsProps) {
  const { response, query, error, canShowMore, onShowMore } = props;

  if (error) {
    return (
      <p className="search-note" role="alert">
        Haku ei latautunut. Tarkista yhteys ja lataa sivu uudelleen.
      </p>
    );
  }
  if (query.trim() === '') return null;
  if (!response) {
    return (
      <p className="search-note search-note--delayed" aria-live="polite">
        Ladataan tuotteita…
      </p>
    );
  }

  const { categories, products, pendingTiers, terms } = response;
  const label = response.query.trim();
  let note = '';
  if (pendingTiers.length > 0) {
    note = 'Haetaan lisää tuotteita…';
  } else if (categories.length === 0 && products.length === 0) {
    note = `Ei tuloksia haulle "${label}".`;
  }

  return (
    <section className="search-results" aria-label="Hakutulokset">
      <ul>
        {categories.map((hit) => (
          <CategoryResult
            key={`c${hit.category.id}`}
            hit={hit}
            label={label}
            onAddGeneric={props.onAddGeneric}
            onBrowse={props.onBrowse}
          />
        ))}
        {products.map((product) => (
          <ProductResult
            key={product.ean}
            product={product}
            terms={terms}
            onAdd={props.onAddProduct}
          />
        ))}
      </ul>
      <p className="search-note" aria-live="polite">
        {note}
      </p>
      {canShowMore && (
        <button type="button" className="search-results__more" onClick={onShowMore}>
          Näytä lisää
        </button>
      )}
    </section>
  );
}

export default SearchResults;
