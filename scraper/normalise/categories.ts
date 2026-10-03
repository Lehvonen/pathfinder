/*
 * Builds the category tree from K-Ruoka's category paths (docs/plans/normalise.md §4,
 * rules 8–9). Pure: clean products and the id registry in, categories and the new
 * registry out.
 *
 * Ids are append-only. Saved lists and share links store categoryId for generic entries,
 * so a category keeps its id across scrapes even if it disappears for a while.
 */
import type { Category } from '@pathfinder/core';
import type { CleanProduct } from './clean';

export type Temperature = Category['temperature'];

/** Categories keyed on their full path, e.g. `maito-juusto-munat-ja-rasvat/maidot`. */
export type CategoryIds = Record<string, number>;

/** For the 7 products K-Ruoka lists without a category. */
export const UNCATEGORISED = 'uncategorised';

/** Colder first: a tie goes to the colder temperature, so frozen-last errs safe. */
const COLDEST_FIRST: Temperature[] = ['frozen', 'chilled', 'ambient'];

export interface CategoryInput {
  products: CleanProduct[];
  ids: CategoryIds;
  departmentTemperatures: ReadonlyMap<string, Temperature>;
  names?: ReadonlyMap<string, string>; // path → display name
  overrides?: ReadonlyMap<string, Temperature>; // path → temperature, wins over the vote
}

export interface CategoryResult {
  categories: Category[]; // in use, with their ancestors, sorted by id
  ids: CategoryIds; // the input registry plus any new paths
  mixed: { path: string; votes: Record<Temperature, number> }[];
  unnamed: string[]; // paths named from their slug
}

export const categoryPathOf = (product: CleanProduct): string =>
  product.categoryPath ?? UNCATEGORISED;

/** `a/b/c` → [`a`, `a/b`, `a/b/c`] */
export function ancestry(path: string): string[] {
  const parts = path.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

/** Fallback name from the last slug: `viihde--ja-pienelektroniikka` → `Viihde- ja pienelektroniikka`. */
export function nameFromSlug(path: string): string {
  const slug = path.split('/').at(-1) ?? path;
  const words = slug.replace(/--/g, '- ').replace(/-(?! )/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** New paths get the next ids in sorted order, so a parent is numbered before its children. */
export function assignIds(registry: CategoryIds, paths: Iterable<string>): CategoryIds {
  const ids = { ...registry };
  let next = Math.max(0, ...Object.values(ids)) + 1;
  for (const path of [...new Set(paths)].sort()) {
    if (!(path in ids)) ids[path] = next++;
  }
  return ids;
}

function emptyVotes(): Record<Temperature, number> {
  return { frozen: 0, chilled: 0, ambient: 0 };
}

/** The most common temperature; ambient when there are no votes. */
export function winner(votes: Record<Temperature, number>): Temperature {
  let best: Temperature | null = null;
  for (const t of COLDEST_FIRST) {
    if (best === null ? votes[t] > 0 : votes[t] > votes[best]) best = t;
  }
  return best ?? 'ambient';
}

export function buildCategories(input: CategoryInput): CategoryResult {
  const { products, departmentTemperatures, names, overrides } = input;

  // Every product votes for its leaf and each ancestor, so a parent reflects all below it
  const votes = new Map<string, Record<Temperature, number>>();
  for (const product of products) {
    const temperature = departmentTemperatures.get(product.departmentId);
    for (const path of ancestry(categoryPathOf(product))) {
      const v = votes.get(path) ?? emptyVotes();
      if (temperature) v[temperature]++;
      votes.set(path, v);
    }
  }

  const ids = assignIds(input.ids, votes.keys());
  const categories: Category[] = [];
  const mixed: CategoryResult['mixed'] = [];
  const unnamed: string[] = [];
  for (const [path, v] of votes) {
    if (COLDEST_FIRST.filter((t) => v[t] > 0).length > 1) mixed.push({ path, votes: v });
    const name = names?.get(path);
    if (!name) unnamed.push(path);
    const parent = ancestry(path).at(-2);
    categories.push({
      id: ids[path]!,
      name: name ?? nameFromSlug(path),
      temperature: overrides?.get(path) ?? winner(v),
      ...(parent !== undefined && { parentId: ids[parent]! }),
    });
  }

  categories.sort((a, b) => a.id - b.id);
  mixed.sort((a, b) => a.path.localeCompare(b.path));
  unnamed.sort();
  return { categories, ids, mixed, unnamed };
}
