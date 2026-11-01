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
Waiting on sim-contracts.

## Next
- Start after sim-contracts merges.
- Emit `wave` `phase: end` (defined but unused); decide when a wave ends.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-01 initialized
