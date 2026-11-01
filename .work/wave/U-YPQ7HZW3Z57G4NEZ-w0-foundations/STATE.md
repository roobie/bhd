---
phase: execute
parent: U-AK7QYARYTSKYZFTE
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'All four slices closed: scaffold, detmath, sim-core, determinism-harness'
  - CI script runs lint + typecheck + tests + banned-API check, all green
  - Same seed run twice in Node yields an identical state-hash sequence
---

# wave/w0-foundations

## Purpose
Foundations for M1: repo scaffold, deterministic math/RNG, sim core, determinism harness (DESIGN.md §7 Wave 0, §6.1).

## Scope
In: slices 0a–0d.
Out: gameplay content (wave 1).

## Context & constraints
Not fully parallel: scaffold must land first (it creates the toolchain). Then detmath and sim-core can run in parallel (sim-core codes against the detmath interface); determinism-harness needs sim-core's hash.
Toolchain: TS 7 strict, Biome, knip, Vitest, Node type stripping (D-NTY5JV4V7WOXX6OA).

## Now
scaffold closed. detmath and sim-core next, in parallel.

## Next
- {detmath, sim-core} → determinism-harness

## Evidence
- scaffold: `npm run ci` green (biome ci, tsc, knip, vitest)
## Harvest
## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 slice/scaffold closed (U-VLEUWSHAPP54R32P)
