---
phase: finalize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Test: same seed + same commands run twice → identical hash sequence (Node)'
  - Same test runs in a browser (Vitest browser mode or equivalent) and matches the Node hash sequence
  - CI fails on banned APIs (Date, performance.now, Math.random, Math.sin/cos/tan/atan2/exp/log/pow/hypot) in sim, perception, bots, intents, director
---

# slice/determinism-harness

## Purpose
Slice 0d: make determinism a pass/fail gate (DESIGN.md §6.1).

## Scope
In: determinism tests, banned-API lint/grep wired into CI.
Out: desync debugging dumps (wave 10).

## Context & constraints
Needs sim-core's hash (`Sim#hash`, `hash` events). Owns the test harness and lint rule files.
- Start from test/detmath-banned.test.ts (detmath's local scan): generalize it to sim, perception, bots, intents, director, and also ban `**` (pow semantics).
- Browser run should cover detmath's KAT and trig tests too, not only sim hashes.
- Replay = feed logged `cmd` events back through `command(player, cmd, tick)`.

## Now
Done; finalizing.

## Next
- Close.

## Evidence
- Node: test/determinism/determinism-node.test.ts runs the scenario twice, interleaved, and via JSON round-trip replay; identical event streams and hashes, pinned in test/determinism/golden.ts.
- Browser: the same golden is asserted in chromium, firefox and webkit (vite.config.ts browser project), along with detmath KAT/trig tests and a dense bitwise detmath sweep digest.
- Purity: test/purity.test.ts scans sim, detmath, perception, bots, intents, director, content with Math-member and import allowlists; 34+ must-flag snippets. CI runs it via `npm test`.
- `npm run ci` locally: biome/tsc/knip clean, node 146 tests, browser 75 (3 files × 3 engines).
- Two Opus reviews; all must/should findings fixed or backlogged.

## Harvest
- [x] decision: -0 canonicalised at command boundary → D-PYEECPV6MBQARWKG
- [x] decision: purity via Vitest source scan with allowlists → D-VDI3GIZQWVCXGSAJ
- [x] decision: one golden shared by all engines; golden change breaks replays → D-NMSA2YZXKCODLCC2
- [x] learning: JSON drops -0 → L-BUDC4M5PFNLU2NTN
- [x] learning: Biome vs purity scan, string goldens, curly-in-string, empty describe → folded into L-ZN7SSMFEBPMSB5WP
- [x] backlog: AST-based scanner → B-YRCOKL4QOGX2O2RT
- [x] backlog: extend scenario as wave 1 lands → covered by B-GLHTOKUXFDT5U2ZC

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 harness landed (Sonnet); Opus review → 13 fixes; Opus verify → scanner hardening
- 2026-11-01 phase execute → finalize
