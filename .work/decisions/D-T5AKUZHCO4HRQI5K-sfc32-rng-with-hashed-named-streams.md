---
status: accepted
date: 2026-11-01
read_if:
  - adding randomness to sim, bots or director
  - changing RNG seeding or stream derivation
refs:
  - src/detmath/index.ts#createRng
  - src/detmath/index.ts#deriveRng
---

# D-T5AKUZHCO4HRQI5K sfc32 RNG with hashed named streams

## Context
Lockstep peers, the reporter and replays all need identical random sequences from a game seed, and bots and the director each need their own stream so adding a bot draw doesn't shift everyone else's.

## Decision
sfc32 behind a small functional API, seeded by integer mixing, with named streams derived by hashing the stream name into the seed.

## Why
sfc32's counter word rules out the all-zero state and guarantees a minimum period, and it needs only 32-bit integer ops, so it is exact in every engine. xoshiro128** needs a zero-state guard; jump-ahead streams would need a stream index registry instead of free-form names.

## Consequences
Any change to seeding or the generator changes every game, so it invalidates stored replays and seed-paired reports (see the pinned known-answer test).
