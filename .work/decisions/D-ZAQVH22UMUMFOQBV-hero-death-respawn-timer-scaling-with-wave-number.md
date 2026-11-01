---
status: accepted
date: 2026-11-01
read_if:
  - implementing hero death or respawn
refs:
  - src/sim/deaths.ts#deathSystem
  - src/sim/waves.ts
---

# D-ZAQVH22UMUMFOQBV Hero death: respawn timer scaling with wave number

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. Heroes were removed on death and teams wiped in 15 to 25 s.

## Decision
Heroes respawn after a timer that scales with the wave number. This replaces removal. There are no scars on death in M2.

## Why
B chose a timer over removal or respawn at the next wave with a scar.

## Consequences
Needs spawning in the middle of a match. A team wipe's effect on the game is a separate proposed decision.
