---
status: accepted
date: 2026-11-01
read_if:
  - implementing Martyrdom or friendly fire against the Penitent
refs:
  - src/sim/combat.ts#dealDamage
---

# D-ENVNBTY5YVUM7NAN Martyrdom floors the Penitent at 1 hp against friendly fire

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. Martyrdom lets him take huge damage while banking Pain, and the Gunner's overpen can kill him in the wombo.

## Decision
During Martyrdom, friendly fire cannot reduce the Penitent below 1 hp.

## Why
B picked the 1 hp floor over letting friendly fire kill him. The alternative made the signature ultimate a gamble on a teammate's aim.

## Consequences
Needs a floor rule in the damage pipeline, scoped to Martyrdom and to ff damage.
