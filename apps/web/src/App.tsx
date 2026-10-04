import type { Category, ListItem } from '@pathfinder/core';
import type { ProductHit } from '@pathfinder/search';
import { useState } from 'react';
import CategoryPage from './search/CategoryPage';
import SearchBar from './search/SearchBar';
import SearchResults from './search/SearchResults';
import { useSearch } from './search/useSearch';
import { useSearchEngine } from './search/useSearchEngine';
import './search/search.css';

function App() {
  const { engine, version, error } = useSearchEngine();
  const search = useSearch(engine, version);
  const [browsing, setBrowsing] = useState<Category | null>(null);
  // Stand-in for the list builder (Track F): keeps the list items and confirms each add.
  const [list, setList] = useState<ListItem[]>([]);
  const [lastAdded, setLastAdded] = useState('');

  const add = (item: ListItem, shown: string) => {
    setList((items) => [...items, item]);
    setLastAdded(shown);
  };
  const addProduct = (product: ProductHit) =>
    add(
      { id: crypto.randomUUID(), kind: 'product', ean: product.ean, quantity: 1, checked: false },
      product.name,
    );
  const addGeneric = (category: Category, label: string) =>
    add(
      {
        id: crypto.randomUUID(),
        kind: 'generic',
        categoryId: category.id,
        label,
        quantity: 1,
        checked: false,
      },
      `"${label}"`,
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
        {lastAdded && `Lisätty listalle: ${lastAdded} (${list.length} kpl)`}
      </p>
    </main>
  );
}

export default App;
