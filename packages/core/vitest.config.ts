import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types.ts', 'src/index.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
