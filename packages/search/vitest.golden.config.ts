import { defineConfig } from 'vitest/config';

// `pnpm search:golden`: acceptance tests on the real catalogue in data/build/core/.
// Not part of `pnpm test`; run after `pnpm data:search` and update in the same commit
// as new data (docs/plans/search.md §8).
export default defineConfig({
  test: { include: ['src/**/*.golden.test.ts'] },
});
