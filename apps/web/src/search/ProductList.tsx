import type { ProductHit, SearchResponse } from '@pathfinder/search';
import { Children, type ReactNode } from 'react';
import ProductResult from './ProductResult';

type ProductListProps = {
  response: SearchResponse;
  /** Shown when there are no rows at all and every tier has been searched. */
  emptyText: string;
  canShowMore: boolean;
  onShowMore(): void;
  onAddProduct(product: ProductHit): void;
  /** Rows listed before the products, such as category results. */
  children?: ReactNode;
};

/**
 * The product rows of a response, with the quiet loading and empty notes and "show more".
 * Shared by the search results and the category page. Notes are announced politely, so
 * a screen reader is not interrupted on every keystroke.
 */
function ProductList(props: ProductListProps) {
  const { response, emptyText, canShowMore, onShowMore, onAddProduct, children } = props;
  const { products, pendingTiers, terms } = response;

  let note = '';
  if (pendingTiers.length > 0) {
    note = 'Haetaan lisää tuotteita…';
  } else if (products.length === 0 && Children.count(children) === 0) {
    note = emptyText;
  }

  return (
    <>
      <ul className="search-results">
        {children}
        {products.map((product) => (
          <ProductResult key={product.ean} product={product} terms={terms} onAdd={onAddProduct} />
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
    </>
  );
}

export default ProductList;
