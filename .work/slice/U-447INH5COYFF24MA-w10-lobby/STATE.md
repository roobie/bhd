---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - 'parseRoomConfig reads room and name from hash or query; no room means solo'
  - 'Pure lobby state machine: two and four peers, slot conflicts, non-host start refused, fingerprint mismatch error; unit tests pass'
  - 'lit-html lobby view (code, copy link, four slots, wave-master placeholder, host start, mismatch screen) with a browser test'
  - 'npm run ci exits 0'
---

# slice/w10-lobby

## Purpose
The lobby UI and its state machine for co-op rooms (wave 10, E1). Integration into main.ts/app.ts is step 3.

## Scope
In: shell/lobbystate.ts, shell/lobby.ts, shell/lobby.css, config.ts room/name, play.html lobby root, tests.
Out: wiring into app.ts/main.ts, transport, signalling.

## Context & constraints
Wire has no slot-pick message: joiners send a `lobby` request, host reads only entries equal to the sender (documented in lobbystate.ts). Names reach only self and host (the wire has no name list).

## Now
Done; committed, awaiting merge.

## Next
- Step 3 integration: mount, feed transport events, build the fingerprint.

## Evidence
- npm run ci exit 0 (node 1097 tests, browser 135).

## Harvest
- [ ] backlog: a wire field for peer names in `lobby` so joiners see each other's names.

## Log
- 2026-11-02 initialized
- 2026-11-02 implemented, ci green
