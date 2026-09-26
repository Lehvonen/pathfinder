export type Product = {
  ean: string;
  name: string;
  brand?: string;
  categoryId: number;
};

export type Placement = {
  ean: string;
  shelfId: string;
  shelfLevel?: number;
  nodeId: string;
  isPrimary: boolean;
};

export type Category = {
  id: number;
  name: string;
  temperature: 'ambient' | 'chilled' | 'frozen';
  parentId?: number;
};

export type Node = {
  id: string;
  x: number;
  y: number;
  kind: 'shelf-access' | 'junction' | 'aisle-end' | 'entrance' | 'checkout';
};

export type Edge = {
  from: string;
  to: string;
  weight: number;
};

export type ListItem =
  | { kind: 'product'; ean: string; checked: boolean }
  | { kind: 'generic'; categoryId: number; label: string; checked: boolean };

// Placeholder — agree the real shape in the contract sprint
export type RouteStop = {
  nodeId: string;
  items: ListItem[];
};

export type Route = {
  stops: RouteStop[];
  polyline: [number, number][];
  totalDistance: number;
  estimatedMinutes: number;
};
