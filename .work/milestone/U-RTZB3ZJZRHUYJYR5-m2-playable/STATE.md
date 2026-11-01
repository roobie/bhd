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
Wave 8 (solo playable) is closed: Penitent, Psyker, Pavise, respawn, call-early, leash and payoff feedback are live, and solo play works on play.html. B reviewed the 8d batch (D-NCHYTWPAOI4MF747, D-NONSS5MFZKJCXC46). Wave 9 (bargains) is next.

## Next
- Wave 9 (bargains: heal the Ancient, never hurt it; D-2PNKLSQWVJEBSWPI).
- Wave 10 (multiplayer, last; never deploy the CF worker).

## Evidence
- w8 closed at 728bb5e+: solo four-hero play on desktop and mobile (criterion 1).
## Harvest
## Log
- 2026-11-01 initialized (parked)
- 2026-11-01 phase initialize → execute
- 2026-11-01 wave w7b-quality-pass closed
- 2026-11-01 wave w6-design-checkpoint closed
- 2026-11-02 wave 8 closed
