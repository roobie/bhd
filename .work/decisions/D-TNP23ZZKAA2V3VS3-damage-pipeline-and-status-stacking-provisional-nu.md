---
status: accepted
date: 2026-11-01
read_if:
  - changing damage, armour, friendly fire or status effects
  - adding an ability that deals damage or applies a status
refs:
  - src/sim/combat.ts#dealDamage
  - src/sim/combat.ts#heal
  - src/sim/statuses.ts#applyStatus
  - src/sim/statuses.ts#effectiveSpeed
---

# D-TNP23ZZKAA2V3VS3 Damage pipeline and status stacking (provisional numbers)

## Context
Several heroes and statuses modify damage; their order, stacking and friendly-fire rules must be fixed so that kits compose predictably and the reporter can attribute damage.

## Decision
Leak damage bypasses everything and is the only damage the Ancient takes; self-hits never apply; same-team hits need the `ff` tag. Then Marked (consumed), Clumped (line/cone/splash), armour reduced by Exposed unless pierce, and every hit keeps at least 20% of its modified amount. Statuses never stack across sources (readers take the max); re-applying from the same source refreshes. Heals never reach the Ancient. Status numbers and the Marked/Exposed/Clumped mechanics are provisional pending B.

## Why
A fixed multiplicative order is easy to reason about and test. Max-not-sum stacking keeps four heroes from multiplying one status into absurd values. The 20% floor keeps armour from making any hero useless. Protecting the Ancient from ff and heals keeps its health a pure measure of leaks until B decides otherwise (§2 mentions Ancient health as a cost axis).

## Consequences
New damage sources only choose tags. Changing order or stacking changes the golden and every hero's numbers. If B wants bargains that hurt or heal the Ancient, this decision is superseded.
