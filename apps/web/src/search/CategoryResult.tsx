import type { Category } from '@pathfinder/core';
import type { CategoryHit } from '@pathfinder/search';

type CategoryResultProps = {
  hit: CategoryHit;
  /** The shopper's own word ("maito"): the label of the generic list entry. */
  label: string;
  onAddGeneric(category: Category, label: string): void;
  onBrowse(category: Category): void;
};

/**
 * A category above the product results (docs/plans/search.md §4). "Lisää" puts the
 * shopper's word on the list as a generic entry ("maito", any milk), resolved to a shelf
 * through `CategoryPlacement` before routing; "Selaa" opens the category's own page.
 */
function CategoryResult({ hit, label, onAddGeneric, onBrowse }: CategoryResultProps) {
  const { category, topProducts } = hit;

  return (
    <li className="category-result">
      <span className="category-result__name">{category.name}</span>
      {topProducts.length > 0 && (
        <span className="category-result__examples">
          esim. {topProducts.map((p) => p.name).join(', ')}
        </span>
      )}
      <span className="category-result__actions">
        <button
          type="button"
          aria-label={`Lisää "${label}" listalle, mikä tahansa: ${category.name}`}
          onClick={() => onAddGeneric(category, label)}
        >
          Lisää "{label}"
        </button>
        <button
          type="button"
          aria-label={`Selaa: ${category.name}`}
          onClick={() => onBrowse(category)}
        >
          Selaa
        </button>
      </span>
    </li>
  );
}

export default CategoryResult;
