import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';
import { fingerprint, NET_FINGERPRINT_FILES } from './src/reporter/fingerprint.ts';

// Tests that run in browsers too: they must not import node:*.
const BROWSER_TESTS = [
  'test/determinism/determinism.browser.test.ts',
  'test/detmath-rng.test.ts',
  'test/detmath-trig.test.ts',
  'test/client/viewer.browser.test.ts',
  'test/client/replay.browser.test.ts',
  // Wave 7 (the files arrive with their slices): the renderer and the shell.
  'test/client/gl.browser.test.ts',
  'test/client/shell.browser.test.ts',
  'test/client/shell/hud.browser.test.ts',
  'test/client/shell/bargains.browser.test.ts',
  // Wave 10: real WebRTC in one page (skips itself on webkit).
  'test/net/rtc.browser.test.ts',
];

// The build identity peers compare in the lobby `hello`: the pure dirs plus the lockstep net files.
const BUILD_FINGERPRINT = fingerprint(fileURLToPath(new URL('.', import.meta.url)), NET_FINGERPRINT_FILES);

export default defineConfig({
  base: './',
  define: { __BHD_FINGERPRINT__: JSON.stringify(BUILD_FINGERPRINT) },
  worker: { format: 'es' },
  build: {
    // Two pages: the debug viewer and the play shell.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play.html', import.meta.url)),
      },
    },
  },
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
        // Firefox fails ICE on http://localhost pages (it works on 127.0.0.1), which the WebRTC test needs.
        server: { host: '127.0.0.1' },
        test: {
          name: 'browser',
          include: BROWSER_TESTS,
          // Runs the determinism scenario on Node; the browsers must match it.
          globalSetup: ['test/determinism/reference.setup.ts'],
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
