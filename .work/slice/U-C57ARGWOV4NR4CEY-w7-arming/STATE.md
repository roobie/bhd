---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - reduceArming emits valid intent post/reserve/cancel commands, clamps the fire time to 1-5 s, refuses late, own and second posts with a hint
  - armPickerView, intentsListView and intentInstances implemented; instances finite; npm run ci exits 0
---

# slice/w7-arming

## Purpose
Arming triggers (7d): the pure arm/reserve/cancel reducer, the picker and intents list fragments, and the intent marker instances.

## Scope
In: src/client/shell/{arming,intentsui,intentfx}.ts and test/client/shell/arming.test.ts
Out: wiring into controls, hud and scene (other slices)

## Context & constraints
Contracts merged; signatures in types.ts are final. Reserve must satisfy fireTick > tick + INPUT_DELAY_TICKS (L-KQN4NFNYHTDB6VAL).


## Now
Implemented and green; finalizing.

## Next
- Merge by the main agent

## Evidence
npm run ci exit 0; arming.test.ts 13 tests.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] learning: ArmStep has no way to reset arming on an unhandled `select`; controls should clear arming when the selected hero changes
- [ ] backlog: intent ring total span is unknown to the client (IntentView has no post tick), so rings use a fixed 5 s full scale

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
