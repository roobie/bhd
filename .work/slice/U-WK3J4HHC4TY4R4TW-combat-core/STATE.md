---
phase: execute
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude
created: 2026-11-01
success_criteria:
  - dealDamage applies flat armour, pierce and statuses, honours the ff flag, emits dmg with tags
  - 'Statuses system: apply/refresh/expire with status on/off events; Suppressed, Marked, Exposed, Clumped with provisional effects'
  - Each effect has a test showing the number it changes; npm run ci green
---

# slice/combat-core

## Purpose
Slice 1b: the damage pipeline and the statuses system.

## Scope
In: combat.ts, statuses.ts, content/statuses.ts
Out: hero kits, enemy AI

## Context & constraints
Owns only its files in the wave DESIGN ownership table (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md). Runs in a worktree in parallel with its sibling. Marked/Exposed/Clumped semantics are provisional; flag them for B.


## Now
Implemented; `npm run ci` green. Awaiting merge / wave close.

## Next
- Merge; lane-waves/gunner/standins build on the semantics below.

## Evidence
- Criterion 1 (dealDamage): src/sim/combat.ts; test/combat/damage.test.ts (armour 10->6, floor 10->2 at armour 50, pierce 10, ff off 0 and no event / ff on 27 after armour 3, leak exact 2 vs armour 99, dmg events carry tags).
- Criterion 2 (statuses): src/sim/statuses.ts, src/content/statuses.ts; test/combat/statuses.test.ts (apply/refresh max, sorted order, removeStatus, expiry exactly at tick == until, same-tick off order, defaults 2-4 s).
- Criterion 3 (each effect shows its number): Marked 40->50 then consumed; Exposed armour 6->1 (14->19); Clumped 10->15 for line/cone/splash; Suppressed 3->1.8 and real-sim distance x0.5; combined order 100->175. `npm run ci`: biome, tsc, knip, 283 node tests, 75 browser tests green.
- Golden regenerated (`npm run golden`): gunner hits on armoured grunts now deal less. test/sim/heroes.test.ts amount 8 -> 7 (grunt armour 1). Old stub test/sim/combat.test.ts removed, superseded by test/combat/.
- Review fixes: Ancient takes only `leak` damage and cannot be healed; self-hit never applies even with ff (lead default, provisional); tests in test/combat/damage.test.ts. `npm run ci` green, golden regenerated.

## Harvest
- [ ] decision: damage order = leak bypass; ff gate (same team, no `ff` tag -> 0 dealt, no event); Marked (+value, consumed); Clumped (+value on line/cone/splash tags, not consumed); armour = max(0, armour - Exposed) unless `pierce`; floor = 20% of the modified amount.
- [ ] decision: statuses never stack across sources: readers use the max value; same (status, src) re-apply refreshes until=max, value=max, no new on event; apply is a no-op on dead targets and durations < 1 tick.
- [ ] decision: Suppressed slows by its max value clamped to [0,1] in effectiveSpeed; rooted = 0; taunted no speed effect.
- [ ] learning: provisional status semantics for B (wave report): Marked = next-hit +25% consumed by any hit (even `pierce`); Exposed = -5 armour for 3 s (flat); Clumped = +30% from line/cone/splash for 2 s, not consumed; Suppressed = -40% speed for 3 s. Numbers are placeholders in content/statuses.ts; appliers pass the value, combat reads the instance value, so the content table is only a default for appliers.
- [ ] learning: sim-contracts stub tests pinned raw damage (8); any armoured target changes hero test expectations. Heroes test now expects armour applied.
- [ ] backlog: Gunner overpen must tag `ff` + `overpen` + `line` to get both friendly fire and Clumped bonus (gunner slice).
- [ ] backlog: `heal` event does not carry tags; add if the reporter needs heal attribution by ability.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 combat-core implemented
