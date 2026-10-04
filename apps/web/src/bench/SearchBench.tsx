import {
  BENCH_SEQUENCES,
  ENGINE_BUDGET_MS,
  PAINT_BUDGET_MS,
  percentile,
  prefixes,
} from '@pathfinder/search';
import { useEffect, useRef, useState } from 'react';
import SearchBar from '../search/SearchBar';
import SearchResults from '../search/SearchResults';
import { useSearch } from '../search/useSearch';
import { useSearchEngine } from '../search/useSearchEngine';

type Summary = { p50: number; p95: number; max: number };
type Report = {
  tier1ReadyMs: number;
  longestTaskMs: number | null;
  paint: Summary;
  engine: Summary;
  keystrokes: number;
};

/** App open → first search possible, warm cache (ARCHITECTURE.md §14). */
const TIER1_BUDGET_MS = 500;

const summarise = (times: number[]): Summary => {
  const sorted = [...times].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: sorted.at(-1) ?? NaN };
};
const ms = (value: number | null) => (value === null ? 'ei tuettu' : `${value.toFixed(1)} ms`);
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * The phone benchmark (docs/plans/search.md step 8), opened with `?bench`. It loads search
 * as the app does, then types every benchmark sequence into the real search screen and
 * measures keystroke → results painted, plus the engine alone. Only in dev builds, or a
 * production build made with VITE_BENCH=1 (the numbers that count: no dev-mode overhead).
 */
function SearchBench() {
  const { engine, version, error } = useSearchEngine();
  const search = useSearch(engine, version);
  const tier1ReadyAt = useRef<number | null>(null);
  const longestTask = useRef<number | null>(null);
  const waiting = useRef<{ query: string; resolve(): void } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  // Everything the timed keystrokes use, typo correction included.
  const allLoaded = search.response?.pendingTiers.length === 0 && !!engine?.typoReady();
  let status = 'ladataan…';
  if (allLoaded) status = 'kaikki tasot ja kirjoitusvirheiden korjaus ladattu';
  else if (engine) status = 'taso 1 valmis, ladataan muita…';

  // Time from navigation until tier 1 is searchable.
  useEffect(() => {
    if (engine && tier1ReadyAt.current === null) tier1ReadyAt.current = performance.now();
  }, [engine]);

  // The longest main-thread task while the tiers load (Chromium only).
  useEffect(() => {
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    longestTask.current = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longestTask.current = Math.max(longestTask.current ?? 0, entry.duration);
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  }, []);

  // A keystroke is painted once the results for it are on screen.
  useEffect(() => {
    const target = waiting.current;
    if (target && search.response?.query === target.query) {
      waiting.current = null;
      void nextPaint().then(target.resolve);
    }
  }, [search.response]);

  const run = async () => {
    if (!engine) return;
    setRunning(true);
    const paint: number[] = [];
    const engineTimes: number[] = [];
    for (const text of BENCH_SEQUENCES) {
      for (const prefix of prefixes(text)) {
        const engineStart = performance.now();
        engine.search(prefix);
        engineTimes.push(performance.now() - engineStart);

        const start = performance.now();
        await new Promise<void>((resolve) => {
          waiting.current = { query: prefix, resolve };
          search.setQuery(prefix);
        });
        paint.push(performance.now() - start);
      }
    }
    search.setQuery('');
    setReport({
      tier1ReadyMs: tier1ReadyAt.current ?? NaN,
      longestTaskMs: longestTask.current,
      paint: summarise(paint),
      engine: summarise(engineTimes),
      keystrokes: paint.length,
    });
    setRunning(false);
  };

  return (
    <main>
      <h1>Hakutesti</h1>
      <p>{navigator.userAgent}</p>
      <p>
        Haku: {status}
        {error && ` · virhe: ${error.message}`}
      </p>
      <button type="button" disabled={!allLoaded || running} onClick={() => void run()}>
        {running ? 'Ajetaan…' : 'Aja testi'}
      </button>
      {report && (
        <pre>
          {[
            `Näppäilyjä: ${report.keystrokes}`,
            `Näppäily → näkyvissä  p50 ${ms(report.paint.p50)}  p95 ${ms(report.paint.p95)}  max ${ms(report.paint.max)}  ` +
              (report.paint.p95 < PAINT_BUDGET_MS ? '✓' : '✗') +
              ` (alle ${PAINT_BUDGET_MS} ms)`,
            `Pelkkä haku          p50 ${ms(report.engine.p50)}  p95 ${ms(report.engine.p95)}  max ${ms(report.engine.max)}  ` +
              (report.engine.p95 < ENGINE_BUDGET_MS ? '✓' : '✗') +
              ` (alle ${ENGINE_BUDGET_MS} ms)`,
            `Taso 1 valmis        ${ms(report.tier1ReadyMs)} ` +
              (report.tier1ReadyMs < TIER1_BUDGET_MS ? '✓' : '✗') +
              ` (alle ${TIER1_BUDGET_MS} ms)`,
            `Pisin jumi latauksessa ${ms(report.longestTaskMs)}`,
          ].join('\n')}
        </pre>
      )}
      <SearchBar value={search.query} onChange={search.setQuery} />
      <SearchResults
        response={search.response}
        query={search.query}
        error={error}
        canShowMore={false}
        onShowMore={() => {}}
        onAddProduct={() => {}}
        onAddGeneric={() => {}}
        onBrowse={() => {}}
      />
    </main>
  );
}

export default SearchBench;
