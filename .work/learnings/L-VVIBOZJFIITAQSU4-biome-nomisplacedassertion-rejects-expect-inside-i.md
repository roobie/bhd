---
date: 2026-11-01
read_if:
  - writing browser tests that skip when WebGL2 is unavailable
refs:
  - test/client/gl.browser.test.ts
---

# L-VVIBOZJFIITAQSU4 Biome noMisplacedAssertion rejects expect inside it.runIf callbacks; guard with an early return instead

## Observation
The lint rule rejects expect inside it.runIf callbacks.

## Why it matters
Use an early return when WebGL2 is unavailable.
