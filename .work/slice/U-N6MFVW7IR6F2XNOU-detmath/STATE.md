---
phase: initialize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Seeded RNG with derivable named streams (game seed → bot/director streams); same seed gives same sequence'
  - 'Deterministic sin, cos, atan2, hypot using only arithmetic and Math.sqrt, tested against reference values within a stated error bound'
  - 'No Math.sin/cos/tan/atan2/exp/log/pow/hypot or Math.random in src/detmath'
---

# slice/detmath

## Purpose
Slice 0b: deterministic math and RNG for lockstep (DESIGN.md §6.1).

## Scope
In: src/detmath only.
Out: fixed-point arithmetic (floats with IEEE-exact ops are allowed).

## Context & constraints
Starts after scaffold. Owns src/detmath exclusively.

## Now
Waiting on scaffold.

## Next
- Pick RNG (e.g. a small counter-based generator so streams derive cleanly) and trig approach (polynomial vs table).

## Evidence
## Harvest
## Log
- 2026-11-01 initialized
