---
phase: initialize
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Lane map: waypoint path, Ancient with hp, hero spawn points'
  - 'Runner, Grunt, Brute, Boss defined per §5 and spawned by a wave schedule (Boss every 5th wave); wave start/end events'
  - 'Enemies walk the lane, aggro onto heroes in range (nearest, ID tiebreak), attack via dealDamage, leak at the Ancient'
  - 'Tests cover schedule timing, aggro, leaks; npm run ci green'
---

# slice/lane-waves

## Purpose
Slice 1a: the lane, the enemy roster and wave spawning.

## Scope
In: map, enemy defs and behaviour, wave schedule
Out: combat maths (combat-core), director (wave 4)

## Context & constraints
Owns only its files in the wave DESIGN ownership table (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md). Runs in a worktree in parallel with its sibling.


## Now
Implemented; `npm run ci` green. Ready for merge (golden regenerated).

## Next
- Merge, then regenerate golden once combined with combat-core.

## Evidence
- Lane map (8 waypoints, serpentine, ends at Ancient 90,30 hp 20; 4 hero spawns): test/lane/waves.test.ts "default content".
- Roster runner/grunt/brute(armour 8)/boss, 15 waves, Boss on 5/10/15 only, escalating; start/end wave events (end = all units spawned and gone, killed or leaked; victory waits for last end): test/lane/waves.test.ts.
- Aggro (nearest hero, lower-id tiebreak, taunted first, leash, return to lane), attack cadence via dealDamage, exact leaks, dead skipped: test/lane/enemies.test.ts (src/sim/enemies.ts).
- 22 new tests in test/lane; `npm run ci`: node 279 passed, browser 75 passed, biome/tsc/knip clean.
- Golden regenerated (`npm run golden`): map, roster speeds, waves and enemy behaviour changed.

## Harvest
- [ ] decision: a wave ends when all its units have spawned and are dead or leaked; ends are emitted in the waves phase of the next tick, and `wavesExhausted` (hence victory) also needs every wave ended.
- [ ] decision: lane-born enemies are told apart from debug-spawned ones by `move.waypoint >= 1`; only lane-born chase and return to lane.
- [ ] backlog: AGGRO_RANGE (6) and LEASH_RANGE (10) are constants in sim/enemies.ts because EnemyDef has no such fields; move to EnemyDef for per-enemy tuning (contracts change).
- [ ] learning: existing tests hard-code the map (hero spawns 80,28; Ancient 90,30), so the new lane keeps those coordinates; touched test/sim/hash.test.ts (SpawnJob.wave) and test/content/default-game.test.ts (15 waves, sturdy Ancient) for it.
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-01 initialized
