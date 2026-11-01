---
phase: finalize
parent: U-PGMECOYBMCUQRATL
owner:
  - claude
created: 2026-11-01
success_criteria:
  - ranged hits show a short client-side tracer coloured by the source; melee shows none
  - sim, events and golden hashes unchanged
  - invariant tests pass; npm run ci exits 0
---

# slice/w7b-projectiles

## Purpose
Render projectiles (B request). The sim resolves ranged attacks instantly, so tracers are client-only visuals derived from dmg events.

## Scope
In: shot effect in snapshot.ts/scene.ts, Effect types, tests.
Out: sim changes, HUD, presentation, ability line/cone flashes.

## Context & constraints
advanceEffects receives the pre-step snapshot (L-PG6CVIRY2D5M6WAX). dmg carries src and dst; no range in events, so ranged = centre gap above 3 units.


## Now
Implemented; CI and visual check.

## Next
- Merge.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] learning: dmg events lack attacker range, so client ranged detection is geometric; a sim `shot` event would be more exact (backlog candidate)
- [ ] backlog: ability line/cone flashes for Gunner overpen and vent

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
