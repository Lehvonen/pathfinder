// A shopping list → the route to walk (ARCHITECTURE.md §9, docs/plans/routing.md §3).
// ROUGH: distances are only as good as the department-level map and its placeholder scale.
import { pathTo, shortestPaths, toWalkGraph, type ShortestPaths, type WalkGraph } from './dijkstra';
import { bestOrder, tourLength, type TourCosts } from './tsp';
import type {
  CategoryPlacement,
  Graph,
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
};

export function toRoutingData(
  graph: Graph,
  placements: PrimaryPlacements,
  categoryPlacements: readonly CategoryPlacement[],
): RoutingData {
  return {
    walk: toWalkGraph(graph),
    placements,
    categoryNodes: new Map(categoryPlacements.map((p) => [p.categoryId, p.nodeId])),
  };
}

/**
 * The route, and the items it could not include: no node for the product or category, or a
 * node no route can reach. They are listed, never dropped silently.
 */
export type RouteResult = { route: Route; unplaced: ListItem[] };

function nodeOf(item: ListItem, data: RoutingData): string | undefined {
  return item.kind === 'product'
    ? data.placements[item.ean]?.nodeId
    : data.categoryNodes.get(item.categoryId);
}

/**
 * Plans the shortest walk for the unchecked items on a list: from an entrance, past every
 * stop once, to the checkout nearest the last stop. Items at the same node are one stop.
 * Both entrances are tried and the shorter route wins; a tie goes to the first in the graph.
 */
export function planRoute(items: readonly ListItem[], data: RoutingData): RouteResult {
  const { walk } = data;
  const nodesOfKind = (kind: string) =>
    [...walk.nodes.values()].filter((node) => node.kind === kind).map((node) => node.id);
  const entrances = nodesOfKind('entrance');
  const checkouts = nodesOfKind('checkout');
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
  const nearestCheckout = (from: string) => {
    let best: string | undefined;
    for (const checkout of checkouts) {
      const d = pathsFrom(from).distance.get(checkout);
      if (d !== undefined && (best === undefined || d < pathsFrom(from).distance.get(best)!)) {
        best = checkout;
      }
    }
    return best;
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
      entrances.every((entrance) => pathsFrom(entrance).distance.has(nodeId)) &&
      nearestCheckout(nodeId) !== undefined;
    if (!reachable) {
      unplaced.push(item);
      continue;
    }
    itemsAt.set(nodeId, [...(itemsAt.get(nodeId) ?? []), item]);
  }
  const stopIds = [...itemsAt.keys()];

  // 2. The best order from each entrance; keep the shorter.
  const between = stopIds.map((a) => stopIds.map((b) => pathsFrom(a).distance.get(b)!));
  const toEnd = stopIds.map((id) => pathsFrom(id).distance.get(nearestCheckout(id)!)!);
  let best: { entrance: string; order: number[]; length: number } | undefined;
  for (const entrance of entrances) {
    const costs: TourCosts = {
      fromStart: stopIds.map((id) => pathsFrom(entrance).distance.get(id)!),
      between,
      toEnd,
    };
    const order = bestOrder(costs);
    const length =
      stopIds.length > 0
        ? tourLength(costs, order)
        : (pathsFrom(entrance).distance.get(nearestCheckout(entrance) ?? '') ?? Infinity);
    if (best === undefined || length < best.length) best = { entrance, order, length };
  }

  // 3. Expand the order into legs: each the walk from the previous point.
  const point = (nodeId: string): RoutePoint => {
    const { x, y } = walk.nodes.get(nodeId)!;
    return { nodeId, x, y };
  };
  const legFrom = (from: string, to: string): RouteLeg => ({
    leg: pathTo(pathsFrom(from), to)!.map((id) => {
      const { x, y } = walk.nodes.get(id)!;
      return [x, y];
    }),
    legDistance: pathsFrom(from).distance.get(to)!,
  });

  const start = best!.entrance;
  let previous = start;
  const stops: RouteStop[] = best!.order.map((index, i) => {
    const nodeId = stopIds[index]!;
    const stop = {
      ...point(nodeId),
      ...legFrom(previous, nodeId),
      order: i + 1,
      items: itemsAt.get(nodeId)!,
    };
    previous = nodeId;
    return stop;
  });
  const checkout = nearestCheckout(previous);
  if (checkout === undefined) throw new Error(`planRoute: no checkout reachable from ${previous}`);
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
