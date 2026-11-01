---
status: accepted
date: 2026-11-01
read_if:
  - implementing or changing the Psyker kit, Warp or backlash
refs:
  - src/sim/heroes/standins.ts
  - src/sim/combat.ts#dealDamage
---

# D-4TKP7DQRMLBK6K7W Psyker kit Y1 Warp Gambler, Rift backlash deferred past M2

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. The Psyker needed a resource and a cost.

## Decision
B chose Y1 'Warp Gambler': Warp raises spell power, and casts above 50 Warp risk a visible, seeded backlash. The Discharge backlash (ff splash around him) is in; the Rift backlash (spawns enemies) is deferred until after M2.

## Why
A visible chance trades ally safety for power, and Quell lets him decline at a mobility cost. Rejected: Y2 'The Vessel' (hard threshold, collapses into a rotation, departs from the rising-chance concept) and Y3 'The Conduit' (Warp on every hero, the most engine work, muddies unique resources). Rift is deferred because it touches wave-end semantics (D-FZ2FXOOFFRB5P2YL).

## Consequences
Needs a Warp resource, a named sim RNG stream and ff on backlash damage. A pull intent must fire later than the Gunner's reaction delay (L-KQN4NFNYHTDB6VAL).
