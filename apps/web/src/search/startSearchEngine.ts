import {
  createSearchEngine,
  type SearchEngine,
  type SearchEngineInput,
  type TierData,
  type TierNumber,
} from '@pathfinder/search';
import type { BaseData } from './loadSearchData';

export type SearchLoader = {
  loadBase(): Promise<BaseData>;
  loadTier(tier: TierNumber): Promise<TierData>;
  /** Resolves once the first results can have been painted. */
  whenIdle(): Promise<void>;
  yieldFn?: SearchEngineInput['yieldFn'];
};

export type SearchStart = {
  /** Stops anything still loading from reaching the engine or calling back. */
  cancel(): void;
  /** Settles when every tier is in, or rejects with the first failure. */
  finished: Promise<void>;
};

/**
 * Loads search in the order that gets a shopper to results fastest (docs/plans/search.md
 * §5): the base files and tier 1 together; `onReady` as soon as tier 1 is searchable;
 * then, once the browser is idle, tiers 2 and 3, each added as soon as it arrives. The
 * engine bumps its version on every tier, so the UI re-runs the query.
 */
export function startSearchEngine(
  loader: SearchLoader,
  onReady: (engine: SearchEngine) => void,
): SearchStart {
  let cancelled = false;

  const run = async () => {
    const [base, tier1] = await Promise.all([loader.loadBase(), loader.loadTier(1)]);
    if (cancelled) return;
    const engine = createSearchEngine({ ...base, yieldFn: loader.yieldFn });
    await engine.addTier(tier1);
    if (cancelled) return;
    onReady(engine);

    await loader.whenIdle();
    if (cancelled) return;
    const later: TierNumber[] = [2, 3];
    await Promise.all(
      later.map(async (tier) => {
        const data = await loader.loadTier(tier);
        if (!cancelled) await engine.addTier(data);
      }),
    );
  };

  return {
    cancel: () => {
      cancelled = true;
    },
    finished: run(),
  };
}

/** After the next paint: `requestIdleCallback` where it exists, else the next task. */
export function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve());
    else setTimeout(resolve, 0);
  });
}
