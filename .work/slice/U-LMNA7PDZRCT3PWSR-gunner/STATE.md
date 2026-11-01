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
- Re-review follow-ups (Opus on 30ce76c): decay 0 now decays 0; lastX/lastY seeded from spawn position; overpen skips hits behind the muzzle; heat tests derive/loosen numbers; leash invariant tests added in test/lane/enemies.test.ts. `npm run ci` exit 0, golden unchanged.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: Gunner choices (tunable): heat decays only when no target; braced spin never decays, unbraced idle drain 2 s; unbrace = rooted and no fire 1 s; abilities refused while locked out; overpen skips the Ancient; braced cones aim along brace facing; one `resource` event per band change; heat bleeds linearly to 0 during lockout, spin resets on overheat.
- [ ] learning: fractional fire periods are not a reason for float epsilons (6/0.4 is exactly 15 in IEEE). Heat in integer basis points and the shot timer in 1/1024 tick keep thresholds exact ("above 60%" means > 6000) and the carry exact.
- [ ] backlog: autocast mask is stored but not honoured (bots, wave 3).
- [ ] backlog: entities have no facing; Gunner keeps its own (kit.facing). Perception/bots may want a shared one.
- [ ] process: scenario.ts hardcodes tick 40 in determinism-node.test.ts; a kit that roots heroes silently breaks the submission-order test.

- Review fixes: heat is integer bp (decay rounds to 33 bp/tick for 1000 bp/s), shot timer in 1/1024 tick (kit.shot, hero.attack.cooldown mirrors it in whole ticks), no epsilons; spin drains only on real movement (position vs kit.lastX/lastY), never braced; overpen line starts at the shooter's edge; idle shot timer clamps to 0. `npm run ci` green (352 node + 75 browser), golden regenerated (scenario now uses a derived short config and covers heat 60/85/100, pierce, overpen incl. ff on a hero, overheat lock, hot Vent, Furnace Heart overpen, taunt, mark, heal, pull+clumped, leak, wave end, game end; checked by a probe, no coverage test by owner decision).
- Gunner invariant "0-damage hit starts no cooldown" intentionally dropped (noted in test/sim/mechanics.test.ts).
- Decision candidate: gunner decay per tick is rounded (33 bp for 1000 bp/s, 1% slow); tunable.
- [ ] decision: leash reach threshold makes effective leash ~6–8; consider aggro-on-damage or raising LEASH_RANGE (design, for B)
- [ ] backlog: heat decay rounding (1000 bp/s → 33 bp/tick, ~1% slow)

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 review fixes applied; owner scope change: no new gameplay-behaviour tests (only engine invariants), so none were added for gunner behaviour
- 2026-11-01 re-review follow-ups applied (decay 0, lastX/lastY init, overpen behind-muzzle, test loosening, leash invariants)
