---
status: accepted
date: 2026-11-01
read_if:
  - changing wave spawning, wave end or victory
  - changing enemy aggro, leash or leak behaviour
refs:
  - src/sim/waves.ts#wavesExhausted
  - src/sim/waves.ts#waveSystem
  - src/sim/enemies.ts#enemySystem
  - src/sim/enemies.ts#LEASH_RANGE
---

# D-FZ2FXOOFFRB5P2YL Wave end and lane-enemy semantics

## Context
The reporter (wave 5) and the director need an unambiguous 'wave over' moment, and heroes must not be able to pull lane enemies away forever.

## Decision
A wave ends once all its units have spawned and each is dead or leaked; the end is emitted one tick later in the waves phase, and victory also needs every wave ended. Lane-born enemies (waypoint >= 1) chase within aggro range but drop their target beyond the leash distance from the lane itself (not from their exit point); a lane enemy only acquires or keeps a hero it can always reach inside the leash (the hero's distance to the lane plus the enemy's reach must stay within the leash), otherwise it ignores that hero and keeps walking; debug-spawned enemies never leash.

## Why
Ending on the last spawn would cut fights mid-wave and skew per-wave metrics; ending on a timer would let unresolved enemies bleed into the next wave's numbers. Measuring the leash from the lane needs no extra entity field and still caps kiting; an exact exit point would need a new field for little gain. Requiring the target to be reachable inside the leash closes a stall: without it, a hero loitering just beyond the boundary made the enemy acquire and drop it every tick, pinning it without ever being hit.

## Consequences
Per-wave reports are well defined. Kiting can drag enemies at most the leash distance off the lane. Aggro and leash are global constants until EnemyDef grows fields (backlog). Distinguishing lane enemies by waypoint is implicit; a dedicated flag would be clearer if more spawn modes appear.
