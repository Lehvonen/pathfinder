import { toRoutingData, type ListItem } from '@pathfinder/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListEntry } from '../list/listState';
import type { LoadedRouting, MapAreas } from './loadRoutingData';
import {
  formatDistance,
  formatMinutes,
  formatStops,
  itemName,
  MESSAGES,
  placeName,
  routeViewFor,
} from './routeView';

const areas: MapAreas = {
  entrances: [{ id: 'sisäänkäynti-1', point: [0, 0] }],
  areas: [
    { id: 'maitokaappi', label: 'Maitokaappi', kind: 'goods', polygon: [] },
    { id: 'kassat-1', label: 'Kassat', kind: 'checkout', polygon: [] },
    { id: 'nimetön-leipä', kind: 'goods', polygon: [] },
  ],
};

// sisäänkäynti-1:0 ── j:0 ── maitokaappi:0
//                      └──── kassat-1:0
const routing: LoadedRouting = {
  data: toRoutingData(
    {
      version: 1,
      nodes: [
        { id: 'sisäänkäynti-1:0', x: 0, y: 0, kind: 'entrance' },
        { id: 'j:0', x: 0, y: 5, kind: 'junction' },
        { id: 'maitokaappi:0', x: 5, y: 5, kind: 'shelf-access' },
        { id: 'kassat-1:0', x: 0, y: 10, kind: 'checkout' },
      ],
      edges: [
        { from: 'sisäänkäynti-1:0', to: 'j:0', weight: 5 },
        { from: 'j:0', to: 'maitokaappi:0', weight: 5 },
        { from: 'j:0', to: 'kassat-1:0', weight: 5 },
      ],
      shelves: [],
    },
    { '111': { nodeId: 'maitokaappi:0', categoryId: 2 } },
    [],
  ),
  areas,
};

const entry = (id: string, ean: string, name: string): ListEntry => {
  const item: ListItem = { id, kind: 'product', ean, quantity: 2, checked: false };
  return { item, name };
};

describe('routeViewFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plans the route, and names each item as the list does', () => {
    const view = routeViewFor([entry('a', '111', 'Kevytmaito 1l')], routing, null);
    if (view.kind !== 'route') throw new Error(`expected a route, got: ${view.text}`);
    expect(view.result.route.stops.map((stop) => stop.nodeId)).toEqual(['maitokaappi:0']);
    expect(view.result.route.totalDistance).toBe(20);
    expect(view.names.get('a')).toBe('Kevytmaito 1l');
    expect(view.areas).toBe(areas);
  });

  it('says the data is still loading', () => {
    expect(routeViewFor([], null, null)).toEqual({ kind: 'message', text: MESSAGES.loading });
  });

  it('says the data failed to load, even if some arrived', () => {
    expect(routeViewFor([], routing, new Error('HTTP 404'))).toEqual({
      kind: 'message',
      text: MESSAGES.loadFailed,
    });
  });

  it('turns a map error into a message instead of throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const noCheckout: LoadedRouting = {
      ...routing,
      data: { ...routing.data, checkouts: [] },
    };
    expect(routeViewFor([entry('a', '111', 'Maito')], noCheckout, null)).toEqual({
      kind: 'message',
      text: MESSAGES.mapError,
    });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('itemName', () => {
  it("uses the list's name, falling back to the generic word or the EAN", () => {
    const names = new Map([['a', 'Kevytmaito 1l']]);
    const product: ListItem = { id: 'a', kind: 'product', ean: '111', quantity: 1, checked: false };
    const generic: ListItem = {
      id: 'g',
      kind: 'generic',
      categoryId: 2,
      label: 'maito',
      quantity: 1,
      checked: false,
    };
    expect(itemName(product, names)).toBe('Kevytmaito 1l');
    expect(itemName({ ...product, id: 'b' }, names)).toBe('111');
    expect(itemName(generic, names)).toBe('maito');
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

  it('gives about-minutes, and "under 1" below a minute', () => {
    expect(formatMinutes(9.4)).toBe('noin 9 min');
    expect(formatMinutes(0.3)).toBe('alle 1 min');
  });

  it('says "pysähdys" for one stop and "pysähdystä" for any other number', () => {
    expect(formatStops(1)).toBe('1 pysähdys');
    expect(formatStops(0)).toBe('0 pysähdystä');
    expect(formatStops(12)).toBe('12 pysähdystä');
  });
});
