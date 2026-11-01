---
status: accepted
date: 2026-11-01
read_if:
  - implementing bargains
  - changing Ancient damage
refs:
  - src/sim/combat.ts#dealDamage
---

# D-2PNKLSQWVJEBSWPI Bargains may heal the Ancient but never hurt it

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. The Ancient takes only leak damage today.

## Decision
Bargains may heal the Ancient but never damage it. Its damage stays leak-only.

## Why
Hurting it would blur the leak as the one way to lose.

## Consequences
Heals must be allowed to target the Ancient in the bargain system.
