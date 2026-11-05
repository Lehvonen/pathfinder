// What the route screens show, worked out without React: the route from each entrance or a
// message, and the words for places, distances and times (docs/plans/route-map.md).
import { compareStrings, planRoute, type ListItem, type RouteResult } from '@pathfinder/core';
import type { ListEntry } from '../list/listState';
import type { LoadedRouting, MapAreas } from './loadRoutingData';

/**
 * The route screens' content: the route planned from every entrance, so switching where to
 * start is instant, with each item's name and the map to name places from; or a message,
 * with whether trying again could help.
 */
export type RouteView =
  | {
      kind: 'route';
      /** In id order: the first, "sisäänkäynti-1", is where a route starts by default. */
      entrances: readonly string[];
      byEntrance: ReadonlyMap<string, RouteResult>;
      names: ReadonlyMap<string, string>;
      areas: MapAreas;
    }
  | { kind: 'message'; text: string; canRetry: boolean };

export const MESSAGES = {
  loading: 'Reittitiedot latautuvat vielä. Hetki…',
  // Not "reload the page": the list lives in memory only, so a reload would empty it.
  // "Yritä uudelleen" loads the data again (useRoutingData's retry).
  loadFailed: 'Reittitiedot eivät latautuneet. Tarkista yhteys ja paina Yritä uudelleen.',
  mapError: 'Reittiä ei voitu laskea: kaupan kartassa on virhe.',
} as const;

/**
 * Plans the route for the list as it is now, once from each entrance. Never throws: data
 * still loading, data that failed to load and a map error (`planRoute` on a split map, from
 * any entrance) each become a message.
 */
export function routeViewFor(
  list: readonly ListEntry[],
  routing: LoadedRouting | null,
  loadError: Error | null,
): RouteView {
  if (loadError !== null) return { kind: 'message', text: MESSAGES.loadFailed, canRetry: true };
  if (routing === null) return { kind: 'message', text: MESSAGES.loading, canRetry: false };
  const items = list.map((entry) => entry.item);
  const entrances = [...routing.data.entrances].sort(compareStrings);
  try {
    const byEntrance = new Map(
      entrances.map((start) => [start, planRoute(items, routing.data, { start })]),
    );
    return {
      kind: 'route',
      entrances,
      byEntrance,
      names: new Map(list.map((entry) => [entry.item.id, entry.name])),
      areas: routing.areas,
    };
  } catch (cause) {
    console.error(cause);
    return { kind: 'message', text: MESSAGES.mapError, canRetry: false };
  }
}

/**
 * The route from `start`, or from the default entrance when `start` is null or not one of
 * them (e.g. after the map changed).
 */
export function chosenRoute(
  view: Extract<RouteView, { kind: 'route' }>,
  start: string | null,
): { start: string; result: RouteResult } {
  const chosen = start !== null && view.byEntrance.has(start) ? start : view.entrances[0]!;
  return { start: chosen, result: view.byEntrance.get(chosen)! };
}

/** The entrance after `start`, going round: what "Vaihda aloituspaikka" switches to. */
export function nextEntrance(view: Extract<RouteView, { kind: 'route' }>, start: string): string {
  const index = view.entrances.indexOf(start);
  return view.entrances[(index + 1) % view.entrances.length]!;
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
