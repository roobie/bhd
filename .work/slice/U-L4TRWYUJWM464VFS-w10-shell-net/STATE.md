---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - 'Shell steps only to driver.steppable() while running, with bounded catch-up; stall keeps rendering'
  - 'Pause, takeover and the bargain toggle go through the driver (setPaused, control commands from SYSTEM_PLAYER)'
  - 'Stalled, paused, desynced (dump button), ended and drop/pause/call callouts show; co-op ownership gating works'
  - 'Solo behaviour unchanged; npm run ci exits 0'
---

# slice/w10-shell-net

## Purpose
Integrate the TickDriver into the shell so a lockstep driver can be dropped in at step 3.

## Scope
In: shell app, frame, controls, hud, hudmodel, bargains, localDriver, tests; Match `networked` guard.
Out: net driver, lobby, restart-to-lobby wiring (hook `ShellOptions.onRestart`).

## Context & constraints
Works fully against localDriver. types.ts changes are additive except TickDriver gained required members.

## Now
Done; committed on branch, awaiting integration.

## Next
- Integration wires netDriver, localPlayers/humanSlots/names, onRestart.

## Evidence
- npm run ci exit 0 (log in scratchpad w10-E2-ci.log)
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-02 initialized
