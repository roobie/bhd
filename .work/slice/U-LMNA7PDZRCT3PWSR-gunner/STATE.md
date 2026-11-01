---
phase: execute
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Gunner kit per project DESIGN §4.1: spin-up, heat bands with resource events, pierce >60%, overpenetration with ff >85%, overheat vent, Brace, Vent, Furnace Heart'
  - 'Suppressing Fire (slot 2): wide low-damage cone applying Suppressed (provisional, B 2026-11-01)'
  - Each mechanic has a test; heat band events match §6.6; npm run ci green
---

# slice/gunner

## Purpose
Slice 1c: the Gunner, the one fully designed hero.

## Scope
In: heroes/gunner.ts, content/heroes/gunner.ts
Out: Gunner bot (wave 3)

## Context & constraints
Owns only its files in the wave DESIGN ownership table (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md). Runs in a worktree in parallel with its sibling.


## Now
Implemented, `npm run ci` green; awaiting merge/review.

## Next
- Start after sim-contracts merges.

## Evidence
- `npm run ci` green (322 node + 75 browser tests), golden regenerated.
- test/gunner/gunner.test.ts (17 tests): cadence, spin ramp/drain, heat bands + resource events both directions, pierce >60, overpen line incl. ally (ff) not self, overheat lockout exact ticks, Brace range/arc/root/unbrace, Vent scaling + spin reset, Suppressing Fire, Furnace Heart window + forced vent.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: Gunner choices (tunable): heat decays only when no target; braced spin never decays, unbraced idle drain 2 s; unbrace = rooted and no fire 1 s; abilities refused while locked out; overpen skips the Ancient; braced cones aim along brace facing; one `resource` event per band change; heat bleeds linearly to 0 during lockout, spin resets on overheat.
- [ ] learning: float periods (6/0.4 = 15.000000000000002) need an epsilon on cooldown compares or shots slip a tick.
- [ ] backlog: autocast mask is stored but not honoured (bots, wave 3).
- [ ] backlog: entities have no facing; Gunner keeps its own (kit.facing). Perception/bots may want a shared one.
- [ ] process: scenario.ts hardcodes tick 40 in determinism-node.test.ts; a kit that roots heroes silently breaks the submission-order test.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
