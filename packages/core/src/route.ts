// A shopping list → the route to walk (ARCHITECTURE.md §9, docs/plans/routing.md §3).
// ROUGH: distances are only as good as the department-level map and its placeholder scale.
import { pathTo, shortestPaths, toWalkGraph, type ShortestPaths, type WalkGraph } from './dijkstra';
import { bestOrder, tourLength, type TourCosts } from './tsp';
import type {
  CategoryPlacement,
  Graph,
  GraphNode,
  ListItem,
  PrimaryPlacements,
  Route,
  RouteLeg,
  RoutePoint,
  RouteStop,
} from './types';

/** Walking pace for the estimate: 1 m/s. */
export const METRES_PER_MINUTE = 60;
/** Time to find and pick up the items at one stop, for the estimate: 20 s. */
export const MINUTES_PER_STOP = 1 / 3;

/** Everything a route is computed from, indexed once when the data has loaded. */
export type RoutingData = {
  walk: WalkGraph;
  placements: PrimaryPlacements;
  categoryNodes: ReadonlyMap<number, string>;
  entrances: readonly string[];
  checkouts: readonly string[];
};

export function toRoutingData(
  graph: Graph,
  placements: PrimaryPlacements,
  categoryPlacements: readonly CategoryPlacement[],
): RoutingData {
  const idsOf = (kind: GraphNode['kind']) =>
    graph.nodes.filter((node) => node.kind === kind).map((node) => node.id);
  return {
    walk: toWalkGraph(graph),
    placements,
    categoryNodes: new Map(categoryPlacements.map((p) => [p.categoryId, p.nodeId])),
    entrances: idsOf('entrance'),
    checkouts: idsOf('checkout'),
  };
}

/**
 * The route, and the items it could not include: no node for the product or category, or a
 * node no entrance or no checkout can be reached from. They are listed, never dropped
 * silently.
 */
export type RouteResult = { route: Route; unplaced: ListItem[] };

function nodeOf(item: ListItem, data: RoutingData): string | undefined {
  return item.kind === 'product'
    ? data.placements[item.ean]?.nodeId
    : data.categoryNodes.get(item.categoryId);
}

/** A broken map, not a broken list: the route can't be planned until the map is fixed. */
function mapError(problem: string): Error {
  return new Error(`planRoute: map error: ${problem}`);
}

/**
 * Plans the shortest walk for the unchecked items on a list: from an entrance, past every
 * stop once, to the checkout nearest the last stop, so the order and the checkout are
 * chosen together. Items at the same node are one stop. Every entrance that reaches all the
 * stops is tried and the shortest route wins; a tie goes to the first in the graph.
 *
 * Throws a map error when two stops can't reach each other, or no one entrance reaches them
 * all: the map is split, and leaving stops out would be wrong.
 */
export function planRoute(items: readonly ListItem[], data: RoutingData): RouteResult {
  const { walk, entrances, checkouts } = data;
  if (entrances.length === 0 || checkouts.length === 0) {
    throw new Error('planRoute: the graph needs an entrance and a checkout');
  }

  const paths = new Map<string, ShortestPaths>();
  const pathsFrom = (id: string) => {
    let found = paths.get(id);
    if (found === undefined) {
      found = shortestPaths(walk, id);
      paths.set(id, found);
    }
    return found;
  };
  /** Metres from one node to another; undefined if no walk joins them. */
  const distance = (from: string, to: string) => pathsFrom(from).distance.get(to);
  const nearestCheckout = (from: string) => {
    let nearest: string | undefined;
    for (const checkout of checkouts) {
      const d = distance(from, checkout);
      if (d !== undefined && (nearest === undefined || d < distance(from, nearest)!)) {
        nearest = checkout;
      }
    }
    return nearest;
  };

  // 1. Each unchecked item to its node; items at one node share a stop, in list order.
  const unplaced: ListItem[] = [];
  const itemsAt = new Map<string, ListItem[]>();
  for (const item of items) {
    if (item.checked) continue;
    const nodeId = nodeOf(item, data);
    const reachable =
      nodeId !== undefined &&
      walk.nodes.has(nodeId) &&
      entrances.some((entrance) => distance(entrance, nodeId) !== undefined) &&
      nearestCheckout(nodeId) !== undefined;
    if (!reachable) {
      unplaced.push(item);
      continue;
    }
    itemsAt.set(nodeId, [...(itemsAt.get(nodeId) ?? []), item]);
  }
  const stopIds = [...itemsAt.keys()];

  // 2. Every stop must reach every other, and some entrance must reach them all.
  for (const a of stopIds) {
    const cut = stopIds.find((b) => distance(a, b) === undefined);
    if (cut !== undefined) throw mapError(`no walk from ${a} to ${cut}`);
  }
  const usable = entrances.filter((entrance) =>
    stopIds.length > 0
      ? stopIds.every((id) => distance(entrance, id) !== undefined)
      : nearestCheckout(entrance) !== undefined,
  );
  if (usable.length === 0) throw mapError('no entrance reaches every stop');

  // 3. The best order from each usable entrance; keep the shortest.
  const between = stopIds.map((a) => stopIds.map((b) => distance(a, b)!));
  const toEnd = stopIds.map((id) => distance(id, nearestCheckout(id)!)!);
  let best: { entrance: string; order: number[]; length: number } | undefined;
  for (const entrance of usable) {
    const costs: TourCosts = {
      fromStart: stopIds.map((id) => distance(entrance, id)!),
      between,
      toEnd,
    };
    const order = bestOrder(costs);
    const length =
      stopIds.length > 0
        ? tourLength(costs, order)
        : distance(entrance, nearestCheckout(entrance)!)!;
    if (best === undefined || length < best.length) best = { entrance, order, length };
  }

  // 4. Expand the order into legs: each the walk from the previous point.
  const point = (nodeId: string): RoutePoint => {
    const { x, y } = walk.nodes.get(nodeId)!;
    return { nodeId, x, y };
  };
  const legFrom = (from: string, to: string): RouteLeg => ({
    leg: pathTo(pathsFrom(from), to)!.map((id) => {
      const { x, y } = point(id);
      return [x, y];
    }),
    legDistance: distance(from, to)!,
  });

  const start = best!.entrance;
  const stops: RouteStop[] = [];
  let previous = start;
  for (const index of best!.order) {
    const nodeId = stopIds[index]!;
    stops.push({
      ...point(nodeId),
      ...legFrom(previous, nodeId),
      order: stops.length + 1,
      items: itemsAt.get(nodeId)!,
    });
    previous = nodeId;
  }
  const checkout = nearestCheckout(previous)!;
  const end = { ...point(checkout), ...legFrom(previous, checkout) };

  const totalDistance = stops.reduce((sum, stop) => sum + stop.legDistance, end.legDistance);
  return {
    route: {
      start: point(start),
      stops,
      end,
      totalDistance,
      estimatedMinutes: totalDistance / METRES_PER_MINUTE + stops.length * MINUTES_PER_STOP,
    },
    unplaced,
  };
}
