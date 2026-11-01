---
status: accepted
date: 2026-11-01
read_if:
  - tuning enemy aggro or leash
refs:
  - src/sim/enemies.ts#LEASH_RANGE
---

# D-2BOISI7VSLW2ZX3F Leash: raise LEASH_RANGE rather than aggro on damage

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. The effective leash was about 6 to 8 against an intended 10.

## Decision
Raise LEASH_RANGE so the effective leash matches the intended 10. Aggro on damage is not adopted.

## Why
B preferred the simple range fix over a new aggro rule.

## Consequences
Revisit if enemies still drop heroes oddly in reports.
