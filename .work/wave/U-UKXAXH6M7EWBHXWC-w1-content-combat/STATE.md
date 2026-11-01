---
phase: execute
parent: U-AK7QYARYTSKYZFTE
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'All five slices closed: sim-contracts, lane-waves, combat-core, gunner, stand-in-heroes'
  - defaultGame() runs headless to a game end (Ancient destroyed or waves cleared) with a 4-hero team and no commands, deterministically
  - npm run ci green; determinism golden covers combat, statuses and the Gunner kit
  - Open design questions batched to B in the wave report
---

# wave/w1-content-combat

## Purpose
Project DESIGN.md §7 Wave 1: content and combat.

## Scope
In: slices 1a–1d plus a contracts slice
Out: perception, bots, director (waves 2–4)

## Context & constraints
See wave DESIGN.md (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md) for the shared contract and file ownership.


## Now
sim-contracts initializing.

## Next
- sim-contracts → (lane-waves ∥ combat-core) → (gunner ∥ stand-in-heroes)

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
- 2026-11-01 phase initialize → execute
