---
status: accepted
date: 2026-11-01
read_if:
  - tuning Psyker Warp gain
  - changing Martyrdom nova targets or friendly fire
refs:
  - src/sim/heroes/psyker.ts
  - src/sim/heroes/penitent.ts
---

# D-WZUSOTNNR42ONL4K Psyker basic attacks build Warp; Martyrdom nova hits enemies only

## Context
PLAN §3 Q1 and Q2 asked how the Psyker builds Warp and whether the Martyrdom nova hurts allies.

## Decision
B (2026-11-01): basic-attack hits add Warp (about +4); the nova hits enemies only.

## Why
Warp from basic attacks keeps the Psyker's risk loop running without extra buttons. An enemies-only nova keeps Martyrdom a payoff, not a team hazard; friendly fire stays opt-in per source (ff tag).

## Consequences
Warp gain is a content knob. Adding ff to the nova needs a new decision.
