import { describe, expect, it, vi } from 'vitest';
import { loadRoutingData } from './loadRoutingData';

// A tiny store: an entrance, a checkout and one shelf, each one step from a junction.
const FILES: Record<string, unknown> = {
  graph: {
    version: 1,
    nodes: [
      { id: 'in:0', x: 0, y: 0, kind: 'entrance' },
      { id: 'j:0', x: 0, y: 5, kind: 'junction' },
      { id: 'maidot:0', x: 5, y: 5, kind: 'shelf-access' },
      { id: 'kassat:0', x: 0, y: 10, kind: 'checkout' },
    ],
    edges: [
      { from: 'in:0', to: 'j:0', weight: 5 },
      { from: 'j:0', to: 'maidot:0', weight: 5 },
      { from: 'j:0', to: 'kassat:0', weight: 5 },
    ],
    shelves: [],
  },
  'placements-primary': { '111': { nodeId: 'maidot:0', categoryId: 2 } },
  'category-placements': [{ categoryId: 2, nodeId: 'maidot:0' }],
  areas: { entrances: [{ id: 'in', point: [0, 0] }], areas: [] },
};

/** A fetch that answers with the fixture the URL names, and records what it was asked for. */
const fakeFetch = () => {
  const requested: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    requested.push(url);
    const name = Object.keys(FILES).find((key) => url.includes(`${key}.json`));
    if (name === undefined) throw new Error(`no fixture for ${url}`);
    return FILES[name];
  });
  return { fetch, requested };
};

describe('loadRoutingData', () => {
  it('fetches the four routing files, and nothing else', async () => {
    const { fetch, requested } = fakeFetch();
    await loadRoutingData(fetch);
    expect(requested).toHaveLength(4);
    for (const name of Object.keys(FILES)) {
      expect(requested.some((url) => url.includes(`${name}.json`))).toBe(true);
    }
  });

  it('indexes the graph and placements, ready for planRoute', async () => {
    const { data } = await loadRoutingData(fakeFetch().fetch);
    expect(data.entrances).toEqual(['in:0']);
    expect(data.checkouts).toEqual(['kassat:0']);
    expect(data.placements['111']).toEqual({ nodeId: 'maidot:0', categoryId: 2 });
    expect(data.categoryNodes.get(2)).toBe('maidot:0');
    expect(data.walk.neighbours.get('j:0')).toHaveLength(3);
  });

  it('passes the map areas through for place names', async () => {
    const { areas } = await loadRoutingData(fakeFetch().fetch);
    expect(areas.entrances).toEqual([{ id: 'in', point: [0, 0] }]);
  });

  it('fails if any file fails', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('graph')) throw new Error('graph.json: HTTP 404');
      return {};
    });
    await expect(loadRoutingData(fetch)).rejects.toThrow('HTTP 404');
  });
});
