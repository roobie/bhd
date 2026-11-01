---
phase: finalize
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
All slices closed; closing wave.

## Next
- Close.

## Evidence
- detmath + sim-core: `npm run ci` green, 54 tests
- scaffold: `npm run ci` green (biome ci, tsc, knip, vitest)
- determinism-harness + ci-pages: `npm run ci` green (node 146, browser 75 across chromium/firefox/webkit); first GitHub QA run 41329126170 green; https://roobie.github.io/bhd/ live.
- Node same-seed identical hash sequence: test/determinism/determinism-node.test.ts.
## Harvest
## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 slice/scaffold closed (U-VLEUWSHAPP54R32P)
- 2026-11-01 slice/detmath (U-N6MFVW7IR6F2XNOU) and slice/sim-core (U-F7JATSM4UXEEF4BP) closed
- 2026-11-01 slice/determinism-harness (U-VKRLXNBMNKEDB46P) and slice/ci-pages (U-UB7VXD5K3HUPVDEY) closed
- 2026-11-01 phase execute → finalize
