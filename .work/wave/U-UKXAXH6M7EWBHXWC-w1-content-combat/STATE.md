---
phase: finalize
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
All criteria hold; finalized, closing.

## Next
- Close; wave 2+ (bots path) is being designed.

## Evidence
- Slices closed: sim-contracts, lane-waves, combat-core, gunner, stand-in-heroes, plus the extra debug-viewer slice (history via `$DP dig`).
- Headless full game: the determinism scenario (defaultGame, 4-hero team) runs to a game end deterministically; golden covers heat 60/85/100, pierce, overpen incl. ff, overheat lock, Furnace Heart, taunt, mark, heal, pull+clumped, leak, wave end, game end.
- CI on main at ef3601c (run 41335461523): test-node, static, build, test-browser, deploy all success; `npm run ci` exit 0 locally with 360 node + 78 browser tests; Pages deploy of the debug viewer succeeded.
- Open design questions batched to B: B-76GY2OACG5EKMQQC (Wave-1 design questions for B).

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
- 2026-11-01 phase execute → finalize
