import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const render = (Root: ComponentType) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );

// `?bench` opens the search benchmark, in dev builds or a build made with VITE_BENCH=1.
// In a normal production build the condition is false at build time, so the benchmark
// is not even emitted.
const benchAvailable = import.meta.env.DEV || import.meta.env.VITE_BENCH === '1';
if (benchAvailable && new URLSearchParams(location.search).has('bench')) {
  void import('./bench/SearchBench').then((bench) => render(bench.default));
} else {
  render(App);
}
