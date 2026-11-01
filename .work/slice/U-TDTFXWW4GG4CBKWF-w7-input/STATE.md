---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - reduce is pure, emits valid commands only for driven live heroes, and a stub arming reducer works (node tests)
  - keymap, pickEntity slop and attachInput pointer dispatch tested; npm run ci green
---

# slice/w7-input

## Purpose
The control reducer and DOM input adapter: every input (keys, mouse, touch, HUD buttons) becomes a UiAction, and the reducer turns it into sim commands for the selected human-driven hero.

## Scope
In: controls.ts, input.ts and their tests.
Out: arming (arming.ts), HUD buttons (hud.ts), wiring (app.ts).

## Context & constraints
Contracts in types.ts are fixed. Reducer calls reduceArming first. No gameplay pinning.


## Now
Implemented and green; awaiting merge.

## Next
- Merge; lead wires input into app.ts.

## Evidence
npm run ci exit 0; node 699 tests, browser 87 tests.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] learning: /tmp/ci.log is shared by parallel agents; write CI output to a per-agent path
- [ ] backlog: tapping an allied hero selects it in the reducer (the table says so); the contract doc does not mention it

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
