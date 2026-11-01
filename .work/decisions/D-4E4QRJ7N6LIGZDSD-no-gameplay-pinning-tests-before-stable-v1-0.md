---
status: accepted
date: 2026-11-01
read_if:
  - writing or changing tests
  - a test fails after a gameplay or tuning change
refs:
  - test/determinism/scenario.ts
---

# D-4E4QRJ7N6LIGZDSD No gameplay-pinning tests before stable v1.0
## Context
Gameplay (numbers, ability behaviour, enemy AI, wave pacing) will change constantly until B declares a stable v1.0. Wave-1 slices wrote tests asserting gameplay outcomes, so every tweak breaks tests that protect nothing.

## Decision
Until v1.0, tests pin only engine invariants and specced engine behaviour: determinism (cross-runtime hash equality and replay equality), complete state hashing, purity, detmath, no crash/NaN, and the engine contracts the design specifies (tick order, command validation, event schema, query ordering, time conversion). Gameplay behaviour and tuning are observed through reports (the diff reporter, the debug viewer), not asserted. B's call (2026-11-01).

## Why
A gameplay assertion before the design settles is debt with no gain: it has to be rewritten on every tweak and cannot catch a regression, because nothing defines "correct" gameplay yet. Reports that show what changed when we tweak give the feedback loop without the cost. Cross-runtime hash equality stays because it needs no pinned value and guards the lockstep property, not the gameplay.

## Consequences
Gameplay tests are not written for new work, and existing ones get pruned (backlog). Gameplay bugs are caught by watching reports and the viewer. Revisit at v1.0, when the stable behaviour becomes worth pinning.
