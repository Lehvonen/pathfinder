import { toRoutingData, type Graph, type ListItem } from '@pathfinder/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListEntry } from '../list/listState';
import type { LoadedRouting, MapAreas } from './loadRoutingData';
import {
  CALCULATING,
  chosenRoute,
  formatDistance,
  formatMinutes,
  formatStops,
  itemName,
  MESSAGES,
  nextEntrance,
  placeName,
  routeViewFor,
  shownRouteView,
} from './routeView';

const areas: MapAreas = {
  entrances: [{ id: 'sisäänkäynti-1', point: [0, 0] }],
  areas: [
    { id: 'maitokaappi', label: 'Maitokaappi', kind: 'goods', polygon: [] },
    { id: 'kassat-1', label: 'Kassat', kind: 'checkout', polygon: [] },
    { id: 'nimetön-leipä', kind: 'goods', polygon: [] },
  ],
};

// sisäänkäynti-1:0 ─5─ j:0 ─5─ maitokaappi:0
// sisäänkäynti-2:0 ─1─┘└─5─ kassat-1:0
const routingGraph: Graph = {
  version: 1,
  nodes: [
    { id: 'sisäänkäynti-2:0', x: 1, y: 5, kind: 'entrance' },
    { id: 'sisäänkäynti-1:0', x: 0, y: 0, kind: 'entrance' },
    { id: 'j:0', x: 0, y: 5, kind: 'junction' },
    { id: 'maitokaappi:0', x: 5, y: 5, kind: 'shelf-access' },
    { id: 'kassat-1:0', x: 0, y: 10, kind: 'checkout' },
  ],
  edges: [
    { from: 'sisäänkäynti-1:0', to: 'j:0', weight: 5 },
    { from: 'sisäänkäynti-2:0', to: 'j:0', weight: 1 },
    { from: 'j:0', to: 'maitokaappi:0', weight: 5 },
    { from: 'j:0', to: 'kassat-1:0', weight: 5 },
  ],
  shelves: [],
};
const placements = { '111': { nodeId: 'maitokaappi:0', categoryId: 2 } };
const categoryPlacements = [{ categoryId: 2, nodeId: 'maitokaappi:0' }];
/** An entrance joined to nothing. */
const looseEntrance = { id: 'sisäänkäynti-3:0', x: 50, y: 50, kind: 'entrance' } as const;

const routing: LoadedRouting = {
  data: toRoutingData(routingGraph, placements, categoryPlacements),
  areas,
};

const product = (id: string, ean: string, name: string): ListEntry => {
  const item: ListItem = { id, kind: 'product', ean, quantity: 2, checked: false };
  return { item, name };
};
const generic = (id: string, label: string, name: string): ListEntry => {
  const item: ListItem = {
    id,
    kind: 'generic',
    categoryId: 2,
    label,
    quantity: 1,
    checked: false,
  };
  return { item, name };
};

describe('routeViewFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plans the route, and names each item as the list does', () => {
    const view = routeViewFor(
      [product('a', '111', 'Kevytmaito 1l'), generic('g', 'maito', '"maito" (Maidot)')],
      routing,
      null,
    );
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    expect(chosenRoute(view, null).result.route.stops.map((stop) => stop.nodeId)).toEqual([
      'maitokaappi:0',
    ]);
    expect(chosenRoute(view, null).result.route.totalDistance).toBe(20);
    expect(view.names.get('a')).toBe('Kevytmaito 1l');
    // A generic entry is named as the list shows it, with its category, not the bare word.
    expect(view.names.get('g')).toBe('"maito" (Maidot)');
    expect(view.areas).toBe(areas);
  });

  it('plans from every entrance, entrance 1 first, so switching needs no new plan', () => {
    const view = routeViewFor([product('a', '111', 'Maito')], routing, null);
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    // Entrance 2 comes first in the graph, but entrance 1 is the default.
    expect(view.entrances).toEqual(['sisäänkäynti-1:0', 'sisäänkäynti-2:0']);
    // From entrance 2 the walk is shorter (1 + 5 + 5 + 5), yet entrance 1 is the default.
    expect(chosenRoute(view, null).start).toBe('sisäänkäynti-1:0');
    expect(chosenRoute(view, null).result.route.totalDistance).toBe(20);
    expect(chosenRoute(view, 'sisäänkäynti-2:0').result.route.totalDistance).toBe(16);
    expect(chosenRoute(view, 'sisäänkäynti-2:0').result.route.start.nodeId).toBe(
      'sisäänkäynti-2:0',
    );
  });

  it('falls back to the default for a start that is not an entrance', () => {
    const view = routeViewFor([product('a', '111', 'Maito')], routing, null);
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    expect(chosenRoute(view, 'maitokaappi:0').start).toBe('sisäänkäynti-1:0');
  });

  it('switches to the next entrance, going round', () => {
    const view = routeViewFor([product('a', '111', 'Maito')], routing, null);
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    expect(nextEntrance(view, 'sisäänkäynti-1:0')).toBe('sisäänkäynti-2:0');
    expect(nextEntrance(view, 'sisäänkäynti-2:0')).toBe('sisäänkäynti-1:0');
  });

  it('passes the items with no place on to the page', () => {
    const unknown = product('x', '999', 'Tuntematon');
    const view = routeViewFor([product('a', '111', 'Maito'), unknown], routing, null);
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    expect(chosenRoute(view, null).result.unplaced).toEqual([unknown.item]);
    expect(view.names.get('x')).toBe('Tuntematon');
  });

  it('says the data is still loading', () => {
    expect(routeViewFor([], null, null)).toEqual({
      kind: 'message',
      text: MESSAGES.loading,
      canRetry: false,
    });
  });

  it('says the data failed to load, even if some arrived, and to try again', () => {
    expect(routeViewFor([], routing, new Error('HTTP 404'))).toEqual({
      kind: 'message',
      text: MESSAGES.loadFailed,
      canRetry: true,
    });
    // Never "reload the page": that would leave the route for search. The route screens have
    // a retry button.
    expect(MESSAGES.loadFailed).toContain('paina Yritä uudelleen');
    expect(MESSAGES.loadFailed).not.toContain('lataa sivu');
  });

  it('leaves out an entrance that cannot be planned from, and keeps the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A third entrance joined to nothing: planning from it alone is a map error.
    const graph = { ...routingGraph, nodes: [...routingGraph.nodes, looseEntrance] };
    const withLoose: LoadedRouting = {
      data: toRoutingData(graph, placements, categoryPlacements),
      areas,
    };
    const view = routeViewFor([product('a', '111', 'Maito')], withLoose, null);
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    expect(view.entrances).toEqual(['sisäänkäynti-1:0', 'sisäänkäynti-2:0']);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('is a map error, not a crash, with no entrance at all', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const noEntrance: LoadedRouting = { ...routing, data: { ...routing.data, entrances: [] } };
    expect(routeViewFor([product('a', '111', 'Maito')], noEntrance, null)).toEqual({
      kind: 'message',
      text: MESSAGES.mapError,
      canRetry: false,
    });
  });

  it('turns a split map into a message instead of throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    //   sisäänkäynti-1:0 ── j1 ── maitokaappi:0     Two aisles joined only through the
    //          └─────────── j2 ── leipä:0           entrance and the checkout, which a walk
    //   kassat-1:0 ── j1, j2                        may not pass through.
    const split: Graph = {
      version: 1,
      nodes: [
        { id: 'sisäänkäynti-1:0', x: 0, y: 0, kind: 'entrance' },
        { id: 'kassat-1:0', x: 0, y: 10, kind: 'checkout' },
        { id: 'j1', x: 5, y: 0, kind: 'junction' },
        { id: 'j2', x: 5, y: 10, kind: 'junction' },
        { id: 'maitokaappi:0', x: 10, y: 0, kind: 'shelf-access' },
        { id: 'leipä:0', x: 10, y: 10, kind: 'shelf-access' },
      ],
      edges: [
        { from: 'sisäänkäynti-1:0', to: 'j1', weight: 5 },
        { from: 'sisäänkäynti-1:0', to: 'j2', weight: 5 },
        { from: 'kassat-1:0', to: 'j1', weight: 5 },
        { from: 'kassat-1:0', to: 'j2', weight: 5 },
        { from: 'j1', to: 'maitokaappi:0', weight: 5 },
        { from: 'j2', to: 'leipä:0', weight: 5 },
      ],
      shelves: [],
    };
    const splitRouting: LoadedRouting = {
      data: toRoutingData(
        split,
        {
          '111': { nodeId: 'maitokaappi:0', categoryId: 2 },
          '222': { nodeId: 'leipä:0', categoryId: 3 },
        },
        [],
      ),
      areas,
    };
    const list = [product('a', '111', 'Maito'), product('b', '222', 'Ruisleipä')];
    expect(routeViewFor(list, splitRouting, null)).toEqual({
      kind: 'message',
      text: MESSAGES.mapError,
      canRetry: false,
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('map error') }),
    );
  });
});

describe('shownRouteView', () => {
  const list = [product('a', '111', 'Maito')];
  const view = routeViewFor(list, routing, null);

  it('shows the route once it is planned for the list asked for', () => {
    expect(shownRouteView(view, list, list)).toBe(view);
  });

  it('shows "calculating" while the planning is for an older list, or not done', () => {
    const newer = [...list];
    expect(shownRouteView(view, list, newer)).toBe(CALCULATING);
    expect(shownRouteView(null, null, list)).toBe(CALCULATING);
  });
});

describe('itemName', () => {
  it("uses the list's name, falling back to the generic word or the EAN", () => {
    const names = new Map([['a', 'Kevytmaito 1l']]);
    const { item: productItem } = product('a', '111', '');
    const { item: genericItem } = generic('g', 'maito', '');
    expect(itemName(productItem, names)).toBe('Kevytmaito 1l');
    expect(itemName({ ...productItem, id: 'b' }, names)).toBe('111');
    expect(itemName(genericItem, names)).toBe('maito');
  });
});

describe('placeName', () => {
  it("uses the map's label for an area", () => {
    expect(placeName('maitokaappi:0', areas)).toBe('Maitokaappi');
    expect(placeName('kassat-1:0', areas)).toBe('Kassat');
  });

  it('names an unlabelled area or an entrance from its id, keeping ä and ö', () => {
    expect(placeName('nimetön-leipä:0', areas)).toBe('Nimetön leipä');
    expect(placeName('sisäänkäynti-1:0', areas)).toBe('Sisäänkäynti 1');
  });
});

describe('formatting', () => {
  it('gives whole metres', () => {
    expect(formatDistance(321.6)).toBe('322 m');
    expect(formatDistance(0)).toBe('0 m');
  });

  it('gives about-minutes from 1 minute up, and "under 1" below it', () => {
    expect(formatMinutes(9.4)).toBe('noin 9 min');
    expect(formatMinutes(1)).toBe('noin 1 min');
    expect(formatMinutes(0.99)).toBe('alle 1 min');
    expect(formatMinutes(0.3)).toBe('alle 1 min');
  });

  it('says "pysähdys" for one stop and "pysähdystä" for any other number', () => {
    expect(formatStops(1)).toBe('1 pysähdys');
    expect(formatStops(0)).toBe('0 pysähdystä');
    expect(formatStops(12)).toBe('12 pysähdystä');
  });
});
