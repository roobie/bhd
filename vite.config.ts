import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.ts'],
    // The sim suites are CPU-bound; leave room for Vite's transforms.
    maxWorkers: '40%',
    isolate: true,
  },
});
