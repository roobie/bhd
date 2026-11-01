---
status: accepted
date: 2026-11-01
read_if:
  - adding a pure folder, a Math member or an import to sim/detmath/bots/director
  - the purity test flags your code
refs:
  - test/purity-scan.ts
  - test/purity.test.ts
---

# D-VDI3GIZQWVCXGSAJ Purity enforced by a Vitest source scan with allowlists, not Biome

## Context
DESIGN.md §6.1 bans nondeterministic APIs in sim, detmath, perception, bots, intents and director. Biome can't scope global or member bans to folders cleanly, and has no allowlist form for Math members or import targets.

## Decision
A Vitest test scans the pure folders' source with allowlists (Math members, relative imports into pure folders) plus a banned-globals list, with must-flag and must-pass snippets as its own tests.

## Why
Allowlists fail closed: an unknown Math member or package import is flagged without anyone predicting it. A test runs everywhere CI and `npm test` already run. Alternatives: Biome overrides (no allowlists), a custom ESLint rule (second linter), an AST scan (better, deferred: TS 7's native compiler has no stable JS API yet).

## Consequences
It guards against accidents, not adversaries; regex-literal and nested-brace bypasses are known (backlog: AST-based scanner). Biome's useDestructuring conflicts with it for Math constants. Required pure folders must exist and contain sources.
