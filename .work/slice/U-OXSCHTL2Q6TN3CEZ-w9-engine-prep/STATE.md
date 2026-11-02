---
phase: finalize
parent: U-IUFI7QQSGH4543TP
owner:
  - claude
created: 2026-11-02
success_criteria:
  - every shared-file edit for bargains landed as identity stubs; npm run ci exits 0
  - 'bargains off: event streams and behaviour unchanged, hashes differ only by the presence flag'
  - CONTRACT.md names every stub and which slice fills it
---

# slice/w9-engine-prep

## Purpose
Land the bargains contract once (types, command, event, hooks, perception, match, shell) so step-2 slices A-E touch only their own files.

## Scope
In: shared-file shapes, identity stubs, engine-spec tests, CONTRACT.md.
Out: any bargain behaviour, the shipped pool, bot scoring, HUD rendering, reporter.

## Context & constraints
Games without bargains must behave exactly as before. Biome strict, knip clean, layering test. See wave PLAN.md.


## Now
Finalize: CI green, committed.

## Next
- Wave lead merges and starts step 2.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- 943+ node tests green; test/sim/bargains.test.ts proves bargains-configured events equal bargains-off events.
- tsc, biome, knip clean.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] learning: a required field on TickContext/HashedState forces edits in hand-built test fixtures; list them in the contract.
- [ ] backlog: knip ignores for stubs are file-wide; trim after step 2.

## Log
- 2026-11-02 initialized
- 2026-11-02 execute: contract landed, tests and CONTRACT.md written
- 2026-11-02 phase initialize → execute
- 2026-11-02 phase execute → finalize
