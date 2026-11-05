// Shortest walks over the store's walk graph (ARCHITECTURE.md §9 step 2, docs/plans/routing.md §3).
import type { Graph, GraphNode } from './types';

/**
 * Node kinds a walk may start or end at but never pass through. A shelf-access node sits in
 * the middle of a block, joined to the aisle on each side, so walking through it would cut
 * through the shelves; entrances and checkouts are where a route begins and ends.
 */
const DEAD_ENDS: ReadonlySet<GraphNode['kind']> = new Set(['shelf-access', 'checkout', 'entrance']);

/** The graph as the router reads it: nodes by id, and each node's edges, both ways. */
export type WalkGraph = {
  nodes: ReadonlyMap<string, GraphNode>;
  neighbours: ReadonlyMap<string, readonly { to: string; weight: number }[]>;
};

/**
 * Indexes a graph once, so every search after it is a map lookup. An edge to a node the
 * graph does not list is skipped; the build's graph check reports those.
 */
export function toWalkGraph(graph: Graph): WalkGraph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const neighbours = new Map<string, { to: string; weight: number }[]>(
    graph.nodes.map((node) => [node.id, []]),
  );
  for (const { from, to, weight } of graph.edges) {
    const fromEdges = neighbours.get(from);
    const toEdges = neighbours.get(to);
    if (fromEdges === undefined || toEdges === undefined) continue;
    fromEdges.push({ to, weight });
    toEdges.push({ to: from, weight });
  }
  return { nodes, neighbours };
}

/** Every node reachable from `from`: its distance in metres, and the node before it. */
export type ShortestPaths = {
  from: string;
  distance: ReadonlyMap<string, number>;
  previous: ReadonlyMap<string, string>;
};

/**
 * Dijkstra from one node. `from` itself may be a dead end, since a walk starts there; any
 * other dead end is reached but never walked through. A plain scan for the nearest node
 * rather than a heap: the department-level graph has under 200 nodes.
 */
export function shortestPaths(walk: WalkGraph, from: string): ShortestPaths {
  if (!walk.nodes.has(from)) throw new Error(`shortestPaths: no node ${from}`);
  const distance = new Map([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([from]);

  while (open.size > 0) {
    let nearest = '';
    let nearestDistance = Infinity;
    for (const id of open) {
      const d = distance.get(id)!;
      if (d < nearestDistance) {
        nearest = id;
        nearestDistance = d;
      }
    }
    open.delete(nearest);

    const kind = walk.nodes.get(nearest)?.kind;
    if (nearest !== from && kind !== undefined && DEAD_ENDS.has(kind)) continue;

    for (const { to, weight } of walk.neighbours.get(nearest) ?? []) {
      const through = nearestDistance + weight;
      if (through < (distance.get(to) ?? Infinity)) {
        distance.set(to, through);
        previous.set(to, nearest);
        open.add(to);
      }
    }
  }
  return { from, distance, previous };
}

/** The node ids from `paths.from` to `to`, both included; undefined if `to` can't be reached. */
export function pathTo(paths: ShortestPaths, to: string): string[] | undefined {
  if (!paths.distance.has(to)) return undefined;
  const path = [to];
  for (let id = to; id !== paths.from;) {
    id = paths.previous.get(id)!;
    path.push(id);
  }
  return path.reverse();
}
