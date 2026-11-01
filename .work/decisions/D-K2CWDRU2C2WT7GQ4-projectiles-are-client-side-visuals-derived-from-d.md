---
status: accepted
date: 2026-11-01
read_if:
  - adding projectile or shot visuals
  - considering a sim shot event
refs:
  - src/client/shell/snapshot.ts#advanceEffects
---

# D-K2CWDRU2C2WT7GQ4 Projectiles are client-side visuals derived from dmg events, filtered by tags

## Context
B asked for projectiles. The sim resolves ranged attacks instantly and has no projectile entities.

## Decision
Tracers are client-only visuals derived from dmg events and filtered by tags (no melee, leak, cone or ability:* hits).

## Why
A sim shot event would change the event schema and the golden hashes for a purely cosmetic effect. Making the sim simulate projectiles was rejected for the same reason.

## Consequences
Ranged detection on the client is geometric, since dmg events carry no attacker range; a sim shot event would be more exact if it is ever worth a golden change.
