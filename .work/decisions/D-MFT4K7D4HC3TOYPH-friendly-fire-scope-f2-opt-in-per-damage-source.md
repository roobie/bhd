---
status: accepted
date: 2026-11-01
read_if:
  - adding a damage source
  - deciding whether damage hits allies
refs:
  - src/sim/combat.ts#dealDamage
---

# D-MFT4K7D4HC3TOYPH Friendly-fire scope F2: opt-in per damage source

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. The scope of friendly fire was open (project DESIGN section 10).

## Decision
F2: each damage source opts in to ff. Gunner overpen and Psyker backlash do; the Penitent nova is optional. B judges each new source.

## Why
It matches how the code works today and keeps bots able to read costs. Rejected: F1 overpen only (no cost to allies from the Psyker) and F3 all area hits (every cone taxes allies, poor on mobile, drowns reports in friendly-fire metrics).

## Consequences
Every new damage source needs an explicit ff decision.
