import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Tests that run in browsers too: they must not import node:*.
const BROWSER_TESTS = ['test/determinism/determinism.test.ts', 'test/detmath-rng.test.ts', 'test/detmath-trig.test.ts'];

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['test/**/*.test.ts'],
          // The sim suites are CPU-bound; leave room for Vite's transforms.
          maxWorkers: '40%',
          isolate: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: BROWSER_TESTS,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
    ],
  },
});
