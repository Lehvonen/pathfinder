import type { Category } from '@pathfinder/core';
import type { ProductHit, SearchEngine } from '@pathfinder/search';
import { useId } from 'react';
import ProductList from './ProductList';
import SearchBar from './SearchBar';
import { useSearch } from './useSearch';

type CategoryPageProps = {
  engine: SearchEngine;
  version: number;
  category: Category;
  onBack(): void;
  /** A sub-category chip was tapped. */
  onOpenCategory(category: Category): void;
  onAddProduct(product: ProductHit): void;
};

/**
 * A category's own page (docs/plans/search.md §4): its products in popularity order,
 * sub-category chips to narrow down, and a search bar that searches only inside it.
 * Render it with `key={category.id}` so another category starts with an empty search.
 */
function CategoryPage(props: CategoryPageProps) {
  const { engine, version, category, onBack, onOpenCategory, onAddProduct } = props;
  const titleId = useId();
  const search = useSearch(engine, version, category.id);
  const subcategories = engine.subcategories(category.id);

  return (
    <section className="category-page" aria-labelledby={titleId}>
      <header className="category-page__header">
        <button type="button" onClick={onBack}>
          ← Takaisin
        </button>
        <h2 id={titleId}>{category.name}</h2>
      </header>

      {subcategories.length > 0 && (
        <nav aria-label="Alaluokat">
          <ul className="chips">
            {subcategories.map((sub) => (
              <li key={sub.id}>
                <button type="button" onClick={() => onOpenCategory(sub)}>
                  {sub.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <SearchBar value={search.query} onChange={search.setQuery} label={`Hae: ${category.name}`} />

      {search.response && (
        <ProductList
          response={search.response}
          emptyText="Ei tuotteita."
          canShowMore={search.canShowMore}
          onShowMore={search.showMore}
          onAddProduct={onAddProduct}
        />
      )}
    </section>
  );
}

export default CategoryPage;
