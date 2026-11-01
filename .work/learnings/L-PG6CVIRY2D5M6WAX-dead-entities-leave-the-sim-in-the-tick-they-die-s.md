---
date: 2026-11-01
read_if:
  - wiring effects or interpolation to snapshots
refs:
  - src/client/shell/app.ts
---

# L-PG6CVIRY2D5M6WAX Dead entities leave the sim in the tick they die, so hit and death effects must be advanced from the predecessor snapshot, not the post-step one

## Observation
Dead entities vanish from the snapshot in the tick they die.

## Why it matters
Pass advanceEffects the predecessor snapshot, or death effects never get a position.
