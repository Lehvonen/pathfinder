// Fetches the core routing files written by `pnpm data:routing` (docs/plans/routing.md §2),
// the same way search fetches its files: `?url` makes each one a content-hashed asset.
import {
  toRoutingData,
  type CategoryPlacement,
  type Graph,
  type PrimaryPlacements,
  type RoutingData,
} from '@pathfinder/core';
import areasUrl from '../../../../data/build/core/areas.json?url';
import categoryPlacementsUrl from '../../../../data/build/core/category-placements.json?url';
import graphUrl from '../../../../data/build/core/graph.json?url';
import placementsUrl from '../../../../data/build/core/placements-primary.json?url';
import { fetchJson, type FetchJson } from '../search/loadSearchData';

/** The store map's areas (data/graph/areas.json): what the app reads of it. */
export type MapAreas = {
  entrances: { id: string; point: [number, number] }[];
  areas: {
    id: string;
    label?: string;
    kind: 'goods' | 'checkout' | 'other';
    polygon: [number, number][];
  }[];
};

/** Everything "Laske reitti" needs: the data `planRoute` reads, and the map for names. */
export type LoadedRouting = { data: RoutingData; areas: MapAreas };

// The files are validated by the build before they are written, so they are trusted here.

/** Fetches the four routing files at once (about 225 KB gzipped) and indexes them. */
export async function loadRoutingData(fetch: FetchJson = fetchJson): Promise<LoadedRouting> {
  const [graph, placements, categoryPlacements, areas] = await Promise.all(
    [graphUrl, placementsUrl, categoryPlacementsUrl, areasUrl].map(fetch),
  );
  return {
    data: toRoutingData(
      graph as Graph,
      placements as PrimaryPlacements,
      categoryPlacements as CategoryPlacement[],
    ),
    areas: areas as MapAreas,
  };
}
