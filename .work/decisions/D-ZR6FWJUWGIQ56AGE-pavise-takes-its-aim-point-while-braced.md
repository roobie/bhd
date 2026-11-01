---
status: accepted
date: 2026-11-01
read_if:
  - changing Pavise placement or Gunner brace facing
refs:
  - src/sim/heroes/gunner.ts
---

# D-ZR6FWJUWGIQ56AGE Pavise takes its aim point while braced

## Context
The Pavise replaced Suppress (D-XVHJGA432FCOHEEU). Bracing locks the Gunner's facing.

## Decision
The Pavise is placed at its own aim point even while braced; cones keep using the brace facing.

## Why
Tying the placement to the brace facing made the Pavise useless exactly when the Gunner holds a line. The alternative was to forbid casting it while braced.

## Consequences
Bots and the client may aim the Pavise freely during a brace.
