---
status: accepted
date: 2026-11-01
read_if:
  - changing what the state hash covers
  - debugging a desync
refs:
  - src/sim/sim.ts#hash
---

# D-NZFIASEDRLJLBWAF State hash excludes pending commands

## Context
Desync detection compares state hashes between peers every N ticks.

## Decision
The hash covers tick, the entity store in ID order (floats by exact bits) and the sim RNG, but not commands queued for future ticks.

## Why
Future inputs legitimately arrive at different times on different peers, so including them would report false desyncs.

## Consequences
Anything that is real game state must be added to the hash, or desyncs in it go undetected.
