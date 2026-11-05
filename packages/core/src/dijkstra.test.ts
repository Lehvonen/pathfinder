import { describe, expect, it } from 'vitest';
import { pathTo, shortestPaths, toWalkGraph } from './dijkstra';
import type { Graph, GraphNode } from './types';

const node = (id: string, kind: GraphNode['kind'] = 'junction'): GraphNode => ({
  id,
  x: 0,
  y: 0,
  kind,
});
const edge = (from: string, to: string, weight: number) => ({ from, to, weight });

/**
 *   in ── a ──1── b ──1── c ── out
 *          \             /
 *           ─────5───────          a → c: 2 via b, 5 direct
 *
 * `shelf` is a block's centre node between a and c, 1 m from each: the short way, but a
 * walk may only stop there, never pass through. `in` is an entrance, `out` a checkout.
 */
function store(): Graph {
  return {
    version: 1,
    nodes: [
      node('in', 'entrance'),
      node('a'),
      node('b'),
      node('c'),
      node('out', 'checkout'),
      node('shelf', 'shelf-access'),
      node('island'),
    ],
    edges: [
      edge('in', 'a', 1),
      edge('a', 'b', 1),
      edge('b', 'c', 1),
      edge('a', 'c', 5),
      edge('c', 'out', 1),
      edge('a', 'shelf', 0.5),
      edge('shelf', 'c', 0.5),
    ],
    shelves: [],
  };
}

const walk = toWalkGraph(store());

describe('shortestPaths', () => {
  it('finds the shortest walk, not the fewest edges', () => {
    const paths = shortestPaths(walk, 'in');
    expect(paths.distance.get('out')).toBe(4);
    expect(pathTo(paths, 'out')).toEqual(['in', 'a', 'b', 'c', 'out']);
  });

  it('walks every edge both ways', () => {
    const paths = shortestPaths(walk, 'c');
    expect(paths.distance.get('in')).toBe(3);
    expect(pathTo(paths, 'in')).toEqual(['c', 'b', 'a', 'in']);
  });

  it('stops at a shelf-access node but never walks through it', () => {
    const paths = shortestPaths(walk, 'a');
    expect(paths.distance.get('shelf')).toBe(0.5);
    // Through the shelf would be 1; the walk has to go round by b.
    expect(paths.distance.get('c')).toBe(2);
    expect(pathTo(paths, 'c')).toEqual(['a', 'b', 'c']);
  });

  it('starts from a dead end', () => {
    const paths = shortestPaths(walk, 'shelf');
    expect(paths.distance.get('c')).toBe(0.5);
    expect(paths.distance.get('out')).toBe(1.5);
  });

  it('never walks through a checkout', () => {
    const g = store();
    // A short cut from a to c through the checkout, which must not be taken.
    g.edges.push(edge('a', 'out', 0.1));
    const paths = shortestPaths(toWalkGraph(g), 'a');
    expect(paths.distance.get('out')).toBe(0.1);
    expect(paths.distance.get('c')).toBe(2);
  });

  it('never walks through an entrance', () => {
    const g = store();
    // The entrance joined to c as well: a → in → c is 1.5, but the walk must go by b.
    g.edges.push(edge('in', 'c', 0.5));
    const paths = shortestPaths(toWalkGraph(g), 'a');
    expect(paths.distance.get('in')).toBe(1);
    expect(paths.distance.get('c')).toBe(2);
    expect(pathTo(paths, 'c')).toEqual(['a', 'b', 'c']);
  });

  it('leaves out nodes it cannot reach', () => {
    const paths = shortestPaths(walk, 'in');
    expect(paths.distance.has('island')).toBe(false);
    expect(pathTo(paths, 'island')).toBeUndefined();
  });

  it('throws for a start that is not in the graph', () => {
    expect(() => shortestPaths(walk, 'nowhere')).toThrow('no node nowhere');
  });
});

describe('pathTo', () => {
  it('is just the start, for the start itself', () => {
    expect(pathTo(shortestPaths(walk, 'b'), 'b')).toEqual(['b']);
  });
});

describe('toWalkGraph', () => {
  it('skips an edge to a node that is not in the graph', () => {
    const g = store();
    g.edges.push(edge('a', 'ghost', 1), edge('ghost', 'c', 1));
    const paths = shortestPaths(toWalkGraph(g), 'in');
    expect(paths.distance.has('ghost')).toBe(false);
    expect(paths.distance.get('out')).toBe(4);
  });
});
