import type { Category, ListItem } from '@pathfinder/core';
import type { ProductHit } from '@pathfinder/search';
import { useReducer, useState } from 'react';
import ShoppingList from './list/ShoppingList';
import { listReducer, newItemId } from './list/listState';
import CategoryPage from './search/CategoryPage';
import SearchBar from './search/SearchBar';
import SearchResults from './search/SearchResults';
import { useSearch } from './search/useSearch';
import { useSearchEngine } from './search/useSearchEngine';
import './search/search.css';
import './list/list.css';

function App() {
  const { engine, version, error } = useSearchEngine();
  const search = useSearch(engine, version);
  const [browsing, setBrowsing] = useState<Category | null>(null);
  // Kept in memory only for now: the list is empty again after a reload.
  const [list, dispatch] = useReducer(listReducer, []);
  const [lastAdded, setLastAdded] = useState('');

  const add = (item: ListItem, name: string) => {
    dispatch({ type: 'add', item, name });
    setLastAdded(name);
  };
  const addProduct = (product: ProductHit) =>
    add(
      { id: newItemId(), kind: 'product', ean: product.ean, quantity: 1, checked: false },
      product.name,
    );
  const addGeneric = (category: Category, label: string) =>
    add(
      {
        id: newItemId(),
        kind: 'generic',
        categoryId: category.id,
        label,
        quantity: 1,
        checked: false,
      },
      `"${label}" (${category.name})`,
    );

  return (
    <main>
      {browsing && engine ? (
        <CategoryPage
          key={browsing.id}
          engine={engine}
          version={version}
          category={browsing}
          onBack={() => setBrowsing(null)}
          onOpenCategory={setBrowsing}
          onAddProduct={addProduct}
        />
      ) : (
        <>
          <SearchBar value={search.query} onChange={search.setQuery} />
          <SearchResults
            response={search.response}
            query={search.query}
            error={error}
            canShowMore={search.canShowMore}
            onShowMore={search.showMore}
            onAddProduct={addProduct}
            onAddGeneric={addGeneric}
            onBrowse={setBrowsing}
          />
        </>
      )}
      <p className="search-note" aria-live="polite">
        {lastAdded && `Lisätty listalle: ${lastAdded}`}
      </p>
      {/* On every page, and always mounted, so it stays open or closed across pages. */}
      <ShoppingList
        list={list}
        onSetQuantity={(id, quantity) => dispatch({ type: 'setQuantity', id, quantity })}
        onRemove={(id) => dispatch({ type: 'remove', id })}
        // Routing is not built yet; the button is there so the flow can be tried.
        onCalculateRoute={() => {}}
      />
    </main>
  );
}

export default App;
