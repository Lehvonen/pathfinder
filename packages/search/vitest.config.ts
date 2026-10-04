import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Golden tests read the real generated catalogue and run only with `pnpm search:golden`
    // (vitest.golden.config.ts): a re-scrape must not turn CI red.
    exclude: [...configDefaults.exclude, 'src/**/*.golden.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/types.ts',
        'src/fixtures.ts',
        'src/index.ts',
        'src/build/index.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
