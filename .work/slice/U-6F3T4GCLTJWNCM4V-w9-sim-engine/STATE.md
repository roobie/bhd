---
phase: finalize
parent: U-IUFI7QQSGH4543TP
owner:
  - claude
created: 2026-11-02
success_criteria:
  - Offers open after configured waves, resolve exactly once (accept, decline, lapse), and effects apply and expire
  - 'Invariants hold: Ancient only loses hp by leaks, no NaN, base def equals effective def with nothing taken'
  - Cross-runtime hashes equal with a scenario that opens, accepts, declines and expires offers; npm run ci exits 0
---

# slice/w9-sim-engine

## Purpose
Build the bargain sim engine: offers, commands, effects, expiry, pause knob, perception.

## Scope
In: src/sim/bargains.ts, content and perception bargains, engine tests, scenario.
Out: bots, HUD, reporter, shipped pool.

## Context & constraints
Builds on CONTRACT.md; Ancient healed never hurt; no gameplay pinning.


## Now
Done; committed, awaiting integration.

## Next
- Integrator wires slices B-E.

## Evidence
npm run ci exit 0 (log w9-A-ci.log); invariant suites 4 policies x 3 seeds; scenario coverage test.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-02 initialized
- 2026-11-02 engine built, review items M1,M3-M5,L3-L8 folded in
- 2026-11-02 phase initialize → execute
- 2026-11-02 phase execute → finalize
