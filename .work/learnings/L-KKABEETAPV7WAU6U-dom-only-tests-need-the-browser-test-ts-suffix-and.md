---
date: 2026-11-01
read_if:
  - adding a test that needs a DOM or browser
  - a browser test runs (and fails) in the node project
refs:
  - vite.config.ts#BROWSER_TESTS
---

# L-KKABEETAPV7WAU6U DOM-only tests need the .browser.test.ts suffix and a BROWSER_TESTS entry

## Observation
The node vitest project globs test/**/*.test.ts, so a DOM-only test must be named *.browser.test.ts, which vite.config.ts excludes from node, and added to the browser project's include list (BROWSER_TESTS).

## Why it matters
A mis-named DOM test fails in node with no DOM, or silently never runs in browsers. True while the two projects share one glob.
