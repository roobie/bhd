---
phase: execute
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Every file in the wave DESIGN ownership table exists with the fixed signatures and a minimal working stub
  - Placeholder dummy entity and spawn/move commands are replaced by the wave-1 command set (debug spawn kept, marked)
  - 'Sim takes {seed, game: GameConfig}; defaultGame() constructs and steps'
  - Determinism scenario uses the new commands; golden regenerated; npm run ci green
---

# slice/sim-contracts

## Purpose
Fix the shared types and files of wave 1 so the other four slices can run in parallel without touching the same files.

## Scope
In: entity model, commands, events, hash, queries, time helpers, kit dispatch, GameConfig, stubs
Out: real combat, waves, kits (other slices)

## Context & constraints
See wave DESIGN.md (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md) for the shared contract and file ownership.

### Origin
Promoted from backlog: B-GLHTOKUXFDT5U2ZC Replace placeholder spawn/move commands and dummy entity in wave 1

### Why
sim-core shipped placeholder `spawn`/`move` commands, a `dummy` entity type and a straight-line move system only so determinism could be tested.

### Notes
Wave 1 (lane map, combat, Gunner, stand-ins) replaces them; keep the determinism tests working while doing so.


## Now
Delegating to a Sonnet agent.

## Next
- Opus review, merge, then lane-waves ∥ combat-core

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

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
