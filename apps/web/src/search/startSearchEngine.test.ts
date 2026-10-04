import type { SearchEngine, TierData, TierNumber } from '@pathfinder/search';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseData } from './loadSearchData';
import { startSearchEngine, whenIdle, type SearchLoader } from './startSearchEngine';

const base: BaseData = {
  categories: [{ id: 1, name: 'Maidot', temperature: 'chilled' }],
  categoryTop: { 1: ['1'] },
  categoryRank: { 1: 0 },
  aliases: {},
};
const tier = (n: TierNumber, names: string[]): TierData => ({
  version: 1,
  tier: n,
  eans: names.map((_, i) => `${n}${i}`),
  names,
  categoryIds: names.map(() => 1),
});
const tiers = {
  1: tier(1, ['Pirkka kevytmaito 1l']),
  2: tier(2, ['Valio luomu maito 1l']),
  3: tier(3, ['Fazer maitosuklaa']),
};

/** A promise the test resolves by hand, to control what has "arrived". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A loader whose every file and idle moment the test releases explicitly. */
function controlledLoader() {
  const files = {
    base: deferred<BaseData>(),
    1: deferred<TierData>(),
    2: deferred<TierData>(),
    3: deferred<TierData>(),
  };
  const idle = deferred<void>();
  const requested: string[] = [];
  const loader: SearchLoader = {
    loadBase: () => (requested.push('base'), files.base.promise),
    loadTier: (n) => (requested.push(`tier ${n}`), files[n].promise),
    whenIdle: () => idle.promise,
    yieldFn: async () => {},
  };
  return { loader, files, idle, requested };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const eans = (engine: SearchEngine) => engine.search('maito').products.map((p) => p.ean);

describe('startSearchEngine', () => {
  it('loads the base files and tier 1 together, and nothing else yet', () => {
    const { loader, requested } = controlledLoader();
    startSearchEngine(loader, () => {});
    expect(requested).toEqual(['base', 'tier 1']);
  });

  it('is ready as soon as tier 1 is searchable, before tiers 2–3 are even requested', async () => {
    const { loader, files, requested } = controlledLoader();
    const onReady = vi.fn();
    startSearchEngine(loader, onReady);
    files.base.resolve(base);
    files[1].resolve(tiers[1]);
    await flush();

    expect(onReady).toHaveBeenCalledOnce();
    const engine = onReady.mock.calls[0]![0] as SearchEngine;
    expect(eans(engine)).toEqual(['10']);
    expect(requested).toEqual(['base', 'tier 1']);
  });

  it('requests tiers 2 and 3 once idle and adds each as it arrives, in any order', async () => {
    const { loader, files, idle, requested } = controlledLoader();
    let engine!: SearchEngine;
    const { finished } = startSearchEngine(loader, (e) => (engine = e));
    files.base.resolve(base);
    files[1].resolve(tiers[1]);
    await flush();
    idle.resolve();
    await flush();
    expect(requested).toEqual(['base', 'tier 1', 'tier 2', 'tier 3']);

    files[3].resolve(tiers[3]);
    await flush();
    expect(engine.search('maito').pendingTiers).toEqual([2]);

    files[2].resolve(tiers[2]);
    await finished;
    expect(eans(engine)).toEqual(['10', '20', '30']);
    // three tiers, then the typo vocabulary, which the engine builds once all tiers are in
    await vi.waitFor(() => expect(engine.getVersion()).toBe(4));
  });

  it('never calls back or adds tiers once cancelled', async () => {
    const { loader, files } = controlledLoader();
    const onReady = vi.fn();
    const start = startSearchEngine(loader, onReady);
    start.cancel();
    files.base.resolve(base);
    files[1].resolve(tiers[1]);
    await start.finished;
    expect(onReady).not.toHaveBeenCalled();
  });

  it('stops adding tiers when cancelled after it was ready', async () => {
    const { loader, files, idle } = controlledLoader();
    let engine!: SearchEngine;
    const start = startSearchEngine(loader, (e) => (engine = e));
    files.base.resolve(base);
    files[1].resolve(tiers[1]);
    await flush();
    idle.resolve();
    await flush();
    start.cancel();
    files[2].resolve(tiers[2]);
    files[3].resolve(tiers[3]);
    await start.finished;
    expect(engine.getVersion()).toBe(1);
  });

  it('does not request later tiers when cancelled while waiting for idle', async () => {
    const { loader, files, idle, requested } = controlledLoader();
    const start = startSearchEngine(loader, () => {});
    files.base.resolve(base);
    files[1].resolve(tiers[1]);
    await flush();
    start.cancel();
    idle.resolve();
    await start.finished;
    expect(requested).toEqual(['base', 'tier 1']);
  });

  it('rejects finished with the first failure', async () => {
    const { loader, files } = controlledLoader();
    const { finished } = startSearchEngine(loader, () => {});
    files.base.reject(new Error('HTTP 404'));
    files[1].resolve(tiers[1]);
    await expect(finished).rejects.toThrow('HTTP 404');
  });
});

describe('whenIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses requestIdleCallback where the browser has it', async () => {
    const requestIdleCallback = vi.fn((callback: () => void) => callback());
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    await whenIdle();
    expect(requestIdleCallback).toHaveBeenCalledOnce();
  });

  it('falls back to the next task without it', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    await expect(whenIdle()).resolves.toBeUndefined();
  });
});
