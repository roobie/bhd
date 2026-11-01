---
status: accepted
date: 2026-11-01
read_if:
  - implementing the early lull or wave calling
  - adding mutators
refs:
  - src/sim/waves.ts#waveSystem
---

# D-H2FHQUWM3IJDUPCU Call next wave early is allowed on any wave

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. Waves 1 to 5 are about 100 s of harmless lull.

## Decision
Calling the next wave early is allowed on every wave, instead of compressing waves or shortening the interval.

## Why
Players choose their own pace. B noted that mutators may later increase the wave count drastically, so compressing a fixed set would not hold.

## Consequences
The early lull starves Pain and Warp unless players call early.
