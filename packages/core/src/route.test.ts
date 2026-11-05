import { describe, expect, it } from 'vitest';
import { METRES_PER_MINUTE, MINUTES_PER_STOP, planRoute, toRoutingData } from './route';
import type { Graph, GraphNode, ListItem } from './types';

const node = (id: string, x: number, y: number, kind: GraphNode['kind']): GraphNode => ({
  id,
  x,
  y,
  kind,
});
const edge = (from: string, to: string, weight: number) => ({ from, to, weight });

/**
 *   west (0,0)                         east (30,0)      entrances
 *     │5                                  │5
 *    j0 ──10── j1 ──10── j2 ──10── j3                   the main aisle, y = 5
 *               │5        │5        │5  │5
 *               a         b        out  d               shelves a, b, d; checkout out
 *
 * `island` is a shelf with no edges: nothing can reach it.
 */
const graph: Graph = {
  version: 1,
  nodes: [
    node('west', 0, 0, 'entrance'),
    node('east', 30, 0, 'entrance'),
    node('j0', 0, 5, 'junction'),
    node('j1', 10, 5, 'junction'),
    node('j2', 20, 5, 'junction'),
    node('j3', 30, 5, 'junction'),
    node('a', 10, 10, 'shelf-access'),
    node('b', 20, 10, 'shelf-access'),
    node('d', 32, 10, 'shelf-access'),
    node('out', 28, 10, 'checkout'),
    node('island', 50, 50, 'shelf-access'),
  ],
  edges: [
    edge('west', 'j0', 5),
    edge('east', 'j3', 5),
    edge('j0', 'j1', 10),
    edge('j1', 'j2', 10),
    edge('j2', 'j3', 10),
    edge('j1', 'a', 5),
    edge('j2', 'b', 5),
    edge('j3', 'out', 5),
    edge('j3', 'd', 5),
  ],
  shelves: [],
};

const data = toRoutingData(
  graph,
  {
    '1': { nodeId: 'a', categoryId: 10 },
    '2': { nodeId: 'b', categoryId: 10 },
    '3': { nodeId: 'a', categoryId: 10 },
    '4': { nodeId: 'd', categoryId: 10 },
    '9': { nodeId: 'island', categoryId: 10 },
  },
  [{ categoryId: 20, nodeId: 'b' }],
);

const product = (ean: string, checked = false): ListItem => ({
  id: `p${ean}`,
  kind: 'product',
  ean,
  quantity: 1,
  checked,
});
const generic = (categoryId: number, label: string): ListItem => ({
  id: `g${categoryId}`,
  kind: 'generic',
  categoryId,
  label,
  quantity: 1,
  checked: false,
});

describe('planRoute', () => {
  it('walks from the better entrance, past every stop, to the nearest checkout', () => {
    // From west: west→a 20, a→b 20, b→out 20 = 60. From east it would be 70.
    const { route, unplaced } = planRoute([product('2'), product('1')], data);
    expect(route.start.nodeId).toBe('west');
    expect(route.stops.map((stop) => stop.nodeId)).toEqual(['a', 'b']);
    expect(route.end.nodeId).toBe('out');
    expect(route.totalDistance).toBe(60);
    expect(unplaced).toEqual([]);
  });

  it('picks the other entrance when that one is shorter', () => {
    // From east: east→d 10, d→out 10 = 20. From west: 40 + 10 = 50.
    const { route } = planRoute([product('4')], data);
    expect(route.start.nodeId).toBe('east');
    expect(route.totalDistance).toBe(20);
  });

  it('numbers the stops 1..n, and puts items at the same node in one stop', () => {
    const one = product('1');
    const three = product('3');
    const { route } = planRoute([one, product('2'), three], data);
    expect(route.stops.map((stop) => stop.order)).toEqual([1, 2]);
    expect(route.stops[0]!.items).toEqual([one, three]);
  });

  it('routes a generic entry through its category placement', () => {
    const milk = generic(20, 'maito');
    const { route } = planRoute([milk], data);
    expect(route.stops.map((stop) => stop.nodeId)).toEqual(['b']);
    expect(route.stops[0]!.items).toEqual([milk]);
  });

  it('lists what it cannot place: unknown product, unknown category, unreachable node', () => {
    const unknown = product('404');
    const noCategory = generic(99, 'ei ole');
    const island = product('9');
    const { route, unplaced } = planRoute([unknown, product('1'), noCategory, island], data);
    expect(unplaced).toEqual([unknown, noCategory, island]);
    expect(route.stops.map((stop) => stop.nodeId)).toEqual(['a']);
  });

  it('leaves out items already checked off', () => {
    const { route, unplaced } = planRoute([product('1', true), product('2')], data);
    expect(route.stops.map((stop) => stop.nodeId)).toEqual(['b']);
    expect(unplaced).toEqual([]);
  });

  it('gives each leg as points from the previous stop, with its distance', () => {
    const { route } = planRoute([product('1')], data);
    expect(route.stops[0]!.leg).toEqual([
      [0, 0],
      [0, 5],
      [10, 5],
      [10, 10],
    ]);
    expect(route.stops[0]!.legDistance).toBe(20);
    expect(route.end.leg[0]).toEqual([10, 10]);
    expect(route.end.leg.at(-1)).toEqual([28, 10]);
  });

  it('adds every leg into the total, and estimates the minutes from it', () => {
    const { route } = planRoute([product('1'), product('2')], data);
    const legs = route.stops.reduce((sum, stop) => sum + stop.legDistance, route.end.legDistance);
    expect(route.totalDistance).toBe(legs);
    expect(route.estimatedMinutes).toBeCloseTo(60 / METRES_PER_MINUTE + 2 * MINUTES_PER_STOP);
  });

  it('walks straight to a checkout for an empty list', () => {
    const { route } = planRoute([], data);
    expect(route.stops).toEqual([]);
    expect(route.start.nodeId).toBe('east');
    expect(route.end.nodeId).toBe('out');
    expect(route.totalDistance).toBe(10);
  });

  it('throws for a graph with no entrance or no checkout', () => {
    const noCheckout = { ...graph, nodes: graph.nodes.filter((n) => n.kind !== 'checkout') };
    expect(() => planRoute([], toRoutingData(noCheckout, {}, []))).toThrow(
      'needs an entrance and a checkout',
    );
  });
});
