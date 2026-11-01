import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';

// Tests that run in browsers too: they must not import node:*.
const BROWSER_TESTS = [
  'test/determinism/determinism.test.ts',
  'test/detmath-rng.test.ts',
  'test/detmath-trig.test.ts',
  'test/client/viewer.browser.test.ts',
];

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
          // DOM-only tests run in the browser project.
          exclude: [...configDefaults.exclude, '**/*.browser.test.ts'],
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
