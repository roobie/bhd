---
date: 2026-11-01
read_if:
  - adding thresholds or fractional timers to a hero kit
  - tempted to add an epsilon to a float comparison in the sim
refs:
  - src/sim/heroes/gunner.ts
---

# L-C5YYK4YZI72XUST2 Gunner numerics: integer basis points and 1/1024-tick timers, not float epsilons

## Observation
Thresholds like 'above 60% heat' are exact when heat is integer basis points (greater than 6000), and the shot carry is exact with the timer in 1/1024 tick. Fractional fire periods do not justify float epsilons (6/0.4 is exactly 15 in IEEE). See refs for the representation.

## Why it matters
Epsilons hide off-by-one band transitions and make hashes brittle. Use integer fixed point for any new kit threshold or fractional timer. Stops being true only if the sim moves to a different numeric model.
