---
date: 2026-11-01
read_if:
  - a detmath known-answer test fails
  - changing the RNG
refs:
  - test/detmath-rng.test.ts
---

# L-C6VTW54YAGSQHHHQ Pinned RNG known-answer vectors guard replays and paired seeds

## Observation
The RNG test pins the first outputs for fixed seeds as literals.

## Why it matters
If that test fails after a change, every stored replay and every seed-paired reporter comparison is invalidated. Only update the literals on purpose, together with a note in the change.
