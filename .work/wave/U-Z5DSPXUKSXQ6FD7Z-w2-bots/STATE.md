---
phase: execute
parent: U-AK7QYARYTSKYZFTE
owner:
  - claude
created: 2026-11-01
success_criteria:
  - a full all-bot game (4 hero bots + Director) plays to `end` on the Pages debug viewer on load
  - bots act only through commands; Match command log replays on a bare Sim with an identical hash sequence (Node + browsers)
  - viewer shows bot choices, intents, clumps and Director tension
  - npm run ci green; all slices closed; wave report sent to B
---

# wave/w2-bots

## Purpose
Let B watch bots play a full game: perception, utility bots, intents board and Director (old waves 2–4 merged), visible in the debug viewer. See DESIGN.md.

## Scope
In: perception, bots (Gunner + stand-ins), intents board, wave master + Director, Match driver, viewer overlays.
Out: reporter (wave 3), human input, multiplayer, Penitent/Psyker.

## Context & constraints
Wave 1 sim, content and viewer on main. §6.1 determinism; D-4E4QRJ7N6LIGZDSD no gameplay tests; B authorised autonomous running to M2 with bots-first priority.


## Now
w2-contracts slice (U-LJEDSZA4LC22MX2H) in progress.

## Next
- after contracts merge: launch perception, intents, gunner-bot, standin-bots, director, viewer in parallel worktrees

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- review fixes (9 findings): `npm run ci` exit 0, golden regenerated
- tuning pass (seeds 1-10, viewer defaults, report-only runner kept outside repo): BEFORE 10/10 ancient-destroyed at waves 13-15, 1 tension peak in 9/10 games (first peak at 204-290s, i.e. only at the end), first hero death 216-297s, pull reserve 1-2, fulfil 0-1 per game. AFTER 3/10 victory (9/20 on seeds 1-20), peaks 1-5 (avg 2.8, build->peak->relax cycles repeat), first hero death 182-329s (victory games: 0-4 deaths), pull posts 6-14, reserves 3-8, fulfils 0-3 per game. Changes: content/director.ts (budgets sawtooth, damageGain 10, peakAbove 0.5, relaxBelow 0.3, lowHpGain 0.03, minIntervalSeconds 14, brute weight 0.7, boss 0.15), perception clumpRadius 7, standins pull.minClump 3, gunner reserve furnace/vent 90 and vent.minHeat 0.12. golden regenerated.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: wave-master/director defaults accepted by B 2026-11-01 (whole roster no hand, budget carries over, early send; fixed wave count with victory; reservations auto-cast for humans too, no lock; director paces, never plays to win)

## Log
- 2026-11-01 initialized; design from Opus planning draft, lead defaults on B's open questions
- 2026-11-01 phase initialize → execute
- 2026-11-01 review fixes (reserve vs seat delay, silent first choice, support pull intent, gunner geometry from perception, dead config, viewer expired/overpen/log, unlockWave in MasterView.costs)
- 2026-11-01 wave-2 tuning pass: content numbers only (see Evidence); no logic changes
