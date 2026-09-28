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

/**
 * Source record. Exactly one placement per product is primary; the rest (end-caps,
 * promos) are display tier. The access node is not stored here: it comes from
 * `Shelf.accessNodeId` for `shelfId`, derived at build time.
 */
export type Placement = {
  ean: string;
  shelfId: string;
  shelfLevel?: number; // for finding, not for routing
  isPrimary: boolean;
};

/** Core tier (placements-primary.json): EAN → what routing needs for that product. */
export type PrimaryPlacements = Record<string, { nodeId: string; categoryId: number }>;

/** Core tier, hand-maintained. The only way a generic list entry resolves to a node. */
export type CategoryPlacement = {
  categoryId: number;
  nodeId: string;
};

export type Category = {
  // qwdqwdqwdqw
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

export type RoutePoint = {
  nodeId: string;
  x: number; // copied from the node, so the map needs no graph lookup
  y: number;
};

export type RouteLeg = {
  leg: [number, number][]; // path from the previous point to this one
  legDistance: number; // metres
};

export type RouteStop = RoutePoint &
  RouteLeg & {
    order: number; // 1, 2, 3… — pin number and list number
    items: ListItem[]; // everything picked up here; items at one shelf share a stop
  };

export type Route = {
  start: RoutePoint; // entrance
  stops: RouteStop[]; // item stops only, so `order` runs 1..n
  end: RoutePoint & RouteLeg; // checkout, reached from the last stop
  totalDistance: number; // sum of every legDistance, including `end`
  estimatedMinutes: number;
};
