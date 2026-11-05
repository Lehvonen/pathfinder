// What the route page shows, worked out without React: the route or a message, and the
// words for places, distances and times (docs/plans/routing.md §4).
import { planRoute, type ListItem, type RouteResult } from '@pathfinder/core';
import type { ListEntry } from '../list/listState';
import type { LoadedRouting, MapAreas } from './loadRoutingData';

/**
 * The route page's content: a planned route, with each item's name and the map to name
 * places from, or a message instead.
 */
export type RouteView =
  | { kind: 'route'; result: RouteResult; names: ReadonlyMap<string, string>; areas: MapAreas }
  | { kind: 'message'; text: string };

export const MESSAGES = {
  loading: 'Reittitiedot latautuvat vielä. Yritä hetken päästä uudelleen.',
  // Not "reload the page": the list lives in memory only, so a reload would empty it.
  // Pressing the button again loads the data again (useRoutingData's retry).
  loadFailed: 'Reittitiedot eivät latautuneet. Tarkista yhteys ja paina Laske reitti uudelleen.',
  mapError: 'Reittiä ei voitu laskea: kaupan kartassa on virhe.',
} as const;

/**
 * Plans the route for the list as it is now. Never throws: data still loading, data that
 * failed to load and a map error (`planRoute` on a split map) each become a message.
 */
export function routeViewFor(
  list: readonly ListEntry[],
  routing: LoadedRouting | null,
  loadError: Error | null,
): RouteView {
  if (loadError !== null) return { kind: 'message', text: MESSAGES.loadFailed };
  if (routing === null) return { kind: 'message', text: MESSAGES.loading };
  try {
    const result = planRoute(
      list.map((entry) => entry.item),
      routing.data,
    );
    return {
      kind: 'route',
      result,
      names: new Map(list.map((entry) => [entry.item.id, entry.name])),
      areas: routing.areas,
    };
  } catch (cause) {
    console.error(cause);
    return { kind: 'message', text: MESSAGES.mapError };
  }
}

/**
 * An item's name as the list shows it. The fallbacks only matter if the list changed
 * between planning and showing: a generic entry's word, or a product's EAN.
 */
export function itemName(item: ListItem, names: ReadonlyMap<string, string>): string {
  return names.get(item.id) ?? (item.kind === 'generic' ? item.label : item.ean);
}

/** "nimetön-leipä" → "Nimetön leipä": for map areas with no label, and entrances. */
function fromId(id: string): string {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The place a node stands for, as the store's map names it. Node ids are
 * `<area or entrance id>:<n>` (docs/plans/map.md §5), so "maitokaappi:0" is the area
 * "maitokaappi". An area with no label, or an entrance, is named from its id.
 */
export function placeName(nodeId: string, areas: MapAreas): string {
  const id = nodeId.split(':')[0]!;
  const area = areas.areas.find((candidate) => candidate.id === id);
  return area?.label ?? fromId(id);
}

/** Whole metres: the map's scale is a placeholder, so decimals would be false precision. */
export function formatDistance(metres: number): string {
  return `${Math.round(metres)} m`;
}

export function formatMinutes(minutes: number): string {
  return minutes < 1 ? 'alle 1 min' : `noin ${Math.round(minutes)} min`;
}

export function formatStops(count: number): string {
  return count === 1 ? '1 pysähdys' : `${count} pysähdystä`;
}
