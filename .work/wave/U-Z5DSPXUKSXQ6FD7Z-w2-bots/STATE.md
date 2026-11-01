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
