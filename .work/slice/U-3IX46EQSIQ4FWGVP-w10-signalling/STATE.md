---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - 'Room machine, worker, ws/broadcast/memory signalling exist with tests; npm run ci exits 0'
---

# slice/w10-signalling

## Purpose
Rooms, relay and presence for multiplayer connection setup, plus TURN credentials.

## Scope
In: worker/**, src/net/signal/*, test/net/{room,signal}.test.ts
Out: deploying the worker (never done by the agent); types.ts changes (none made)

## Context & constraints
Contract: src/net/types.ts Signalling. No new deps; CF types declared by hand.


## Now
Done; awaiting integration.

## Next
- Integrator: merge, deploy worker by hand

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

- ci exit 0 on branch

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-02 initialized
