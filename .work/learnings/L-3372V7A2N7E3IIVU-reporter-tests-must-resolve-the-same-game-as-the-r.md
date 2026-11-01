---
date: 2026-11-01
read_if:
  - writing reporter metric tests against real runs
refs:
  - test/reporter/metrics.test.ts
---

# L-3372V7A2N7E3IIVU Reporter tests must resolve the same game as the run

test/reporter/metrics.test.ts resolved the real run against legacyGame(). A hero missing from the resolved game gets Infinity max hp, and its metrics turn NaN once it takes damage. Resolve against the game the run actually used.
