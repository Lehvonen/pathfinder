// Shared data contract. See docs/plans/contract.md for the reasoning.
// Changes to this file need two reviewers.

// ── Catalogue ────────────────────────────────────────────────

/** Display tier — lazy-loaded. Keyed on EAN: names change, barcodes do not. */
export type Product = {
  ean: string;
  name: string;
  brand?: string;
  categoryId: number;
};

/** Primary placements are core tier; secondary (end-caps, promos) are display tier. */
export type Placement = {
  ean: string;
  shelfId: string;
  shelfLevel?: number; // for finding, not for routing
  nodeId: string; // resolved access node in the walk graph
  isPrimary: boolean;
};

export type Category = {
  id: number;
  name: string;
  temperature: 'ambient' | 'chilled' | 'frozen';
  parentId?: number;
};

// ── Walk graph (graph.json) ──────────────────────────────────
// Coordinates are in METRES. Origin (0, 0) is the top-left of the floorplan,
// y grows downwards (same as SVG). One decimal place is enough.

export type GraphNode = {
  id: string; // section-prefixed, e.g. "dairy:12"
  x: number;
  y: number;
  kind: 'shelf-access' | 'junction' | 'aisle-end' | 'entrance' | 'checkout';
  aisle?: number; // aisle order, used by the serpentine baseline
};

/** Stored ONCE. The router treats every edge as walkable in both directions. */
export type Edge = {
  from: string;
  to: string;
  weight: number; // metres
};

export type Shelf = {
  id: string; // the shelf ID printed in the store
  accessNodeId: string; // where you stand to reach it
  polygon: [number, number][]; // outline, in metres
};

export type Graph = {
  version: 1;
  nodes: GraphNode[];
  edges: Edge[];
  shelves: Shelf[];
};

// ── Shopping list ────────────────────────────────────────────
// `id` is created with crypto.randomUUID() when an item is added.
// Share links encode content only; ids are regenerated on load.

export type ListItem =
  | { id: string; kind: 'product'; ean: string; quantity: number; checked: boolean }
  | {
      id: string;
      kind: 'generic';
      categoryId: number;
      label: string;
      quantity: number;
      checked: boolean;
    };

// ── Route ────────────────────────────────────────────────────

export type RouteStop = {
  order: number; // 1, 2, 3… — pin number and list number
  nodeId: string;
  x: number; // copied from the node, so the map needs no graph lookup
  y: number;
  items: ListItem[]; // everything picked up here; items at one shelf share a stop
  leg: [number, number][]; // path from the previous stop to this one
  legDistance: number; // metres
};

export type Route = {
  stops: RouteStop[]; // entrance first, checkout last
  totalDistance: number; // sum of legDistance
  estimatedMinutes: number;
};
