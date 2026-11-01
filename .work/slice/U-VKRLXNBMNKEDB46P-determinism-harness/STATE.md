---
phase: initialize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Test: same seed + same commands run twice → identical hash sequence (Node)'
  - 'Same test runs in a browser (Vitest browser mode or equivalent) and matches the Node hash sequence'
  - 'CI fails on banned APIs (Date, performance.now, Math.random, Math.sin/cos/tan/atan2/exp/log/pow/hypot) in sim, perception, bots, intents, director'
---

# slice/determinism-harness

## Purpose
Slice 0d: make determinism a pass/fail gate (DESIGN.md §6.1).

## Scope
In: determinism tests, banned-API lint/grep wired into CI.
Out: desync debugging dumps (wave 10).

## Context & constraints
Needs sim-core's hash. Owns the test harness and lint rule files.

## Now
Waiting on sim-core.

## Next
- Choose the banned-API mechanism: Biome can't scope `noRestrictedGlobals`-style bans to folders cleanly, so likely a Vitest source scan like deadvox's test/coreIsPure.test.ts.

## Evidence
## Harvest
## Log
- 2026-11-01 initialized
