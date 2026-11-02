---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - 'src/net/types.ts exports Transport, Signalling and the WireMsg union with pure encode/decode-validate helpers, unit-tested'
  - 'TickDriver replaces CommandSink in the shell; localDriver reproduces the old local behaviour'
  - 'Control commands (drive, bargainPolicy) are validated, logged no-ops in the sim and applied by Match.step only from SYSTEM_PLAYER'
  - 'The sim enforces player = slot to accept a hero-bound bargain card; team cards and Decline stay open'
  - 'The determinism scenario covers control commands and CI (incl. cross-runtime) passes'
  - 'Decision records for topology, R1, control commands plus bargain ownership; stubs let step 2 compile'
---

# slice/w10-net-contract

## Purpose
Fix the interfaces and engine rules wave 10's parallel slices build against.

## Scope
In: src/net/types.ts and stubs, TickDriver and localDriver, control commands, bargain ownership, scenario segment, decisions.
Out: signalling, WebRTC, lockstep core, lobby, shell integration (step 2).

## Context & constraints
Rule R1 (D-JE6GN42N3RGVK62M), topology (D-M7JGZLR6PZCVS7DE), control commands and ownership (D-VXJDVX4RFRWSLUQB). No gameplay pinning (D-4E4QRJ7N6LIGZDSD).

## Now
Done pending CI and commit.

## Next
- Step 2 slices A-E2 (see the wave PLAN).

## Evidence
- npm run ci exit code recorded in the commit report.

## Harvest
- [ ] backlog: shell still calls match.setDriven / setBargainPolicy directly in solo play; move onto control commands in slice E2.

## Log
- 2026-11-02 initialized
- 2026-11-02 executed; phase initialize -> execute
