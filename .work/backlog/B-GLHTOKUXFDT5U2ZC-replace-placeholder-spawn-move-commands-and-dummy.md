---
created: 2026-11-01
---

# B-GLHTOKUXFDT5U2ZC Replace placeholder spawn/move commands and dummy entity in wave 1

## Why
sim-core shipped placeholder `spawn`/`move` commands, a `dummy` entity type and a straight-line move system only so determinism could be tested.

## Notes
Wave 1 (lane map, combat, Gunner, stand-ins) replaces them; keep the determinism tests working while doing so.
