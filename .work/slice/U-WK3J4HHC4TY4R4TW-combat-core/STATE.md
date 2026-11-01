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
Sonnet agent implementing in a worktree.

## Next
- Start after sim-contracts merges.
- Implement the Suppressed slow in `effectiveSpeed` (the contracts stub ignores it; movement.ts already calls it). Keep the `leak` tag bypass and keep setting `ctx.killers`.

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
