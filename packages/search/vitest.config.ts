import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Until the first module lands, an empty suite must not fail CI.
    passWithNoTests: true,
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
