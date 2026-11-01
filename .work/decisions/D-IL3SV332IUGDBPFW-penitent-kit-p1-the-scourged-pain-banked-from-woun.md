---
status: accepted
date: 2026-11-01
read_if:
  - implementing or changing the Penitent kit or Pain
refs:
  - src/sim/combat.ts#dealDamage
  - src/sim/heroes/standins.ts
---

# D-IL3SV332IUGDBPFW Penitent kit P1 The Scourged: Pain banked from wounds

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. The Penitent needed a resource and a cost axis other than damage.

## Decision
B chose P1 'The Scourged' for the Penitent. Pain fills with damage taken, friendly fire counts x1.5, and heals do 25% on him. B accepted these Pain rules.

## Why
P1 puts the cost on survival: he grows stronger at low hp, and the Gunner's friendly fire becomes fuel the team must negotiate. Exposed is his setup, Clumped his cash-in. Rejected: P2 'The Flagellant' (hp as currency, weaker friendly-fire synergy, bots that misjudge hp costs die first) and P3 'The Intercessor' (tether is a new mechanic, muddies attribution, loses the stand-in-the-fire fantasy).

## Consequences
Needs a damage-taken hook, a per-target heal multiplier and a Pain resource. Risks to watch in reports: the early lull starves Pain, and Wound-Zeal may become a duty rather than a choice. Numbers are rough first values.
