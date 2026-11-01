---
status: accepted
date: 2026-11-01
read_if:
  - designing lockstep input delivery
  - changing command scheduling in the sim
refs:
  - src/sim/sim.ts#command
---

# D-ZWZVLE5U4MRETLI7 Commands apply in player then per-player sequence order; past ticks rejected

## Context
In lockstep, commands from different players reach each peer in different interleavings; the sim must apply them identically everywhere.

## Decision
Within a tick, commands apply sorted by player then by that player's submission sequence. Commands for a tick already run are rejected and not logged.

## Why
Peers then only need each player's commands in order (one ordered channel per player), not a globally agreed arrival order. Sorting by arrival or by a global counter would need extra coordination.

## Consequences
The net layer must guarantee every peer has all of a tick's inputs before stepping it; if one peer accepts a command another rejected as past, that is a desync the sim cannot see.
