import type { Category, ListItem, Route } from '@pathfinder/core';
import type { ProductHit } from '@pathfinder/search';
import { useDeferredValue, useMemo, useState } from 'react';
import { dayOf } from './history/history';
import RememberOffer from './history/RememberOffer';
import Suggestions from './history/Suggestions';
import { suggestions } from './history/ranking';
import { useHistory } from './history/useHistory';
import ShoppingList from './list/ShoppingList';
import { newItemId, pickedCount, type ListEntry } from './list/listState';
import type { NamedItem } from './list/listStorage';
import { useSavedList } from './list/useSavedList';
import FinishScreen from './route/FinishScreen';
import ListEditPage from './route/ListEditPage';
import type { MapAreas } from './route/loadRoutingData';
import RouteOverview from './route/RouteOverview';
import { chosenRoute, routeViewFor, shownRouteView } from './route/routeView';
import ShoppingPage from './route/ShoppingPage';
import { useRoutingData } from './route/useRoutingData';
import CategoryPage from './search/CategoryPage';
import { isEmptyQuery } from './search/emptyQuery';
import SearchBar from './search/SearchBar';
import SearchResults from './search/SearchResults';
import { useSearch } from './search/useSearch';
import { useSearchEngine } from './search/useSearchEngine';
import './search/search.css';
import './list/list.css';
import './route/route.css';
import './map/map.css';
import './route/shopping.css';
import './history/history.css';

/** Which screen is showing; search includes its category pages. */
type Screen = 'search' | 'route' | 'edit' | 'shopping' | 'finish';

/**
 * The shop under way: the route fixed when "Aloita ostokset" was pressed, and when. Not
 * `Trip`, which is a finished shop in the purchase history.
 */
type Shop = {
  route: Route;
  /** Items the route could not place, still shown in the open sheet. */
  unplaced: readonly ListItem[];
  names: ReadonlyMap<string, string>;
  areas: MapAreas;
  /** The first "Aloita ostokset": a re-plan mid-shop keeps it, so the time is the whole shop. */
  startedAt: number;
  finishedAt: number | null;
  /** The finish card asks "Muistetaanko ostoksesi?": set when it opens, so the answer shows. */
  askToRemember: boolean;
};

function App() {
  const { engine, version, error } = useSearchEngine();
  const search = useSearch(engine, version);
  // Routing loads once search is ready (or has failed), so it never slows the first search.
  const {
    routing,
    error: routingError,
    retry: retryRouting,
  } = useRoutingData(engine !== null || error !== null);
  const [browsing, setBrowsing] = useState<Category | null>(null);
  // Saved on this device, so a refresh keeps it (docs/plans/device-storage.md).
  const [list, dispatch] = useSavedList();
  // Opt-in, on this device only (docs/plans/device-storage.md §3–4). Not `history`, which
  // would hide the browser's own.
  const purchases = useHistory();
  // "Lisätty listalle: …", and what the history controls did, read out politely.
  const [note, setNote] = useState('');
  const [screen, setScreen] = useState<Screen>('search');
  // The entrance the shopper chose; null is the default, entrance 1.
  const [start, setStart] = useState<string | null>(null);
  // The list as it was when the route was planned. The route screen is worked out from it
  // and the routing data, so it turns from "loading" into the route by itself when the data
  // lands, while later edits to the list leave it as it was. Deferred, so the screen paints
  // at once and the planning (from both entrances) happens straight after.
  const [routedList, setRoutedList] = useState<readonly ListEntry[] | null>(null);
  const plannedList = useDeferredValue(routedList);
  const routeView = useMemo(
    () => plannedList && routeViewFor(plannedList, routing, routingError),
    [plannedList, routing, routingError],
  );
  const shownView = shownRouteView(routeView, plannedList, routedList);
  const [trip, setTrip] = useState<Shop | null>(null);
  // "Usein ostamasi" is worked out only while it shows: not on every tick mid-shop.
  const showSuggestions =
    screen === 'search' && !browsing && isEmptyQuery(search.query) && purchases.consent === 'yes';
  const today = dayOf(new Date());
  const suggested = useMemo(
    () => (showSuggestions ? suggestions(purchases.trips, list, today) : []),
    [showSuggestions, purchases.trips, list, today],
  );
  // The ticks are the list's own (`checked`): the shopping screen ticks and unticks them, and
  // the list panel and edit screen show them with "✓ Kerätty" to untick. A ticked item is
  // left out of the next route, so that is how it gets back on.
  const ticked = useMemo(
    () => new Set(list.filter((entry) => entry.item.checked).map((entry) => entry.item.id)),
    [list],
  );

  /** Plans the route for the list as it is now and shows it. */
  const showRoute = () => {
    if (routingError !== null) retryRouting();
    setRoutedList(list);
    setScreen('route');
    window.scrollTo(0, 0);
  };
  const showScreen = (next: Screen) => {
    setScreen(next);
    window.scrollTo(0, 0);
  };
  const backFromEdit = () => {
    if (list.length === 0) showScreen('search');
    else showRoute();
  };
  const setQuantity = (id: string, quantity: number) =>
    dispatch({ type: 'setQuantity', id, quantity });
  const remove = (id: string) => dispatch({ type: 'remove', id });
  const untick = (id: string) => dispatch({ type: 'setChecked', id, checked: false });

  /** Fixes the route on the overview and starts the shop; only offered once there is one. */
  const startShopping =
    shownView.kind === 'route'
      ? () => {
          const { route, unplaced } = chosenRoute(shownView, start).result;
          setTrip((current) => ({
            route,
            unplaced,
            names: shownView.names,
            areas: shownView.areas,
            startedAt: current?.startedAt ?? Date.now(),
            finishedAt: null,
            askToRemember: false,
          }));
          showScreen('shopping');
        }
      : undefined;
  const finishShopping = () => {
    setTrip(
      (current) =>
        current && {
          ...current,
          finishedAt: Date.now(),
          askToRemember: purchases.consent === null,
        },
    );
    showScreen('finish');
  };
  /** "Valmis": the shop is over, so the list starts empty again; the history keeps the ticks. */
  const closeTrip = () => {
    purchases.record(list);
    dispatch({ type: 'clear' });
    setRoutedList(null);
    setTrip(null);
    showScreen('search');
  };

  const add = (item: ListItem, name: string) => {
    dispatch({ type: 'add', item, name });
    setNote(`Lisätty listalle: ${name}`);
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
  /** A suggestion goes on the list with amount 1, like a search result. */
  const addSuggestion = (thing: NamedItem) =>
    add({ ...thing.item, id: newItemId(), quantity: 1, checked: false }, thing.name);

  return (
    <main>
      {screen === 'shopping' && trip !== null ? (
        <ShoppingPage
          route={trip.route}
          names={trip.names}
          areas={trip.areas}
          ticked={ticked}
          onTick={(id, checked) => dispatch({ type: 'setChecked', id, checked })}
          onBack={() => showScreen('search')}
          onFinish={finishShopping}
          unplaced={trip.unplaced}
        />
      ) : screen === 'finish' && trip !== null ? (
        <FinishScreen
          route={trip.route}
          areas={trip.areas}
          elapsedMs={(trip.finishedAt ?? trip.startedAt) - trip.startedAt}
          picked={pickedCount(list)}
          onDone={closeTrip}
        >
          {trip.askToRemember && (
            <RememberOffer consent={purchases.consent} onAnswer={purchases.answer} />
          )}
        </FinishScreen>
      ) : screen === 'route' ? (
        <RouteOverview
          view={shownView}
          start={start}
          onChangeStart={setStart}
          onEditList={() => showScreen('edit')}
          onBack={() => showScreen('search')}
          onRetry={retryRouting}
          onStartShopping={startShopping}
        />
      ) : screen === 'edit' ? (
        <ListEditPage
          list={list}
          onSetQuantity={setQuantity}
          onRemove={remove}
          onUntick={untick}
          onAddMore={() => showScreen('search')}
          onBack={backFromEdit}
        />
      ) : browsing && engine ? (
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
          {showSuggestions && (
            <Suggestions
              things={suggested}
              onAdd={addSuggestion}
              onForget={() => {
                purchases.forget();
                setNote('Ostohistoria unohdettu. Seuraavat ostokset muistetaan taas.');
              }}
              onStop={() => {
                purchases.answer('no');
                setNote('Ostohistoria poistettu. Ostoksiasi ei enää muisteta.');
              }}
            />
          )}
        </>
      )}
      {screen === 'search' && (
        <>
          <p className="search-note" aria-live="polite">
            {note}
          </p>
          {/* Only on search: the route screens replace it (docs/plans/route-map.md). */}
          <ShoppingList
            list={list}
            onSetQuantity={setQuantity}
            onRemove={remove}
            onUntick={untick}
            onCalculateRoute={showRoute}
          />
        </>
      )}
    </main>
  );
}

export default App;
