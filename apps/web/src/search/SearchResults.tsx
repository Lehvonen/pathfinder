import type { Category } from '@pathfinder/core';
import type { ProductHit, SearchResponse } from '@pathfinder/search';
import CategoryResult from './CategoryResult';
import ProductList from './ProductList';

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
 * quiet notes, not errors (ARCHITECTURE.md §11).
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

  // After a typo correction the results, and a generic entry's label, are for the fix.
  const label = response.corrected?.to ?? response.query.trim();

  return (
    <section aria-label="Hakutulokset">
      {response.corrected && (
        <p className="search-note" aria-live="polite">
          Näytetään tulokset haulle <strong>"{response.corrected.to}"</strong>
        </p>
      )}
      <ProductList
        response={response}
        emptyText={`Ei tuloksia haulle "${label}".`}
        canShowMore={canShowMore}
        onShowMore={onShowMore}
        onAddProduct={props.onAddProduct}
      >
        {response.categories.map((hit) => (
          <CategoryResult
            key={hit.category.id}
            hit={hit}
            label={label}
            onAddGeneric={props.onAddGeneric}
            onBrowse={props.onBrowse}
          />
        ))}
      </ProductList>
    </section>
  );
}

export default SearchResults;
