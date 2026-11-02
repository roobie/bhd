---
phase: execute
parent: U-2ZIOI7JI7MQRPCYP
owner:
  - B
  - claude
created: 2026-11-01
success_criteria:
  - 'Solo play on desktop and mobile with four heroes: player drives any, bots drive the rest'
  - 2–4 player co-op over the internet via WebRTC lockstep
  - A human can play wave master against bot heroes
---

# milestone/m2-playable

## Purpose
Something playable. See project DESIGN.md §7 (Milestone 2, waves 6–11).

## Scope
In: design checkpoint with B, client shell, solo loop, Penitent + Psyker, bargains, multiplayer, human wave master.
Out: anything not signed off by B at the wave 6 checkpoint.

## Context & constraints
Starts after M1 closes. Wave 6 is a design checkpoint with B before any code.

## Now
All waves are done. Wave 10 (multiplayer) is closed: star-topology lockstep over WebRTC, lobby, signalling Worker (built and unit tested, never deployed). M2 waits on B to deploy the Worker (secrets, allowed origins) and play a 2-4 player internet session.

## Next
- B deploys the Worker and plays a 2-4 player internet session; record it as Evidence, then close M2.

## Evidence
- w8 closed at 728bb5e+: solo four-hero play on desktop and mobile (criterion 1).
- w10 closed at 153dea9: CI green locally and on GitHub; 2-4 peer harness hashes equal; injected desync localised by `bhd desync`; two Chromium tabs played co-op over real WebRTC with BroadcastChannel signalling (criterion 2, local only).
- Open: internet play is unproven until B deploys the Worker (criterion 2).## Harvest
## Log
- 2026-11-02 wave 10 (multiplayer) closed; awaiting B's Worker deploy and internet session
- 2026-11-02 wave 9 (bargains) closed
- 2026-11-01 initialized (parked)
- 2026-11-01 phase initialize → execute
- 2026-11-01 wave w7b-quality-pass closed
- 2026-11-01 wave w6-design-checkpoint closed
- 2026-11-02 wave 8 closed
