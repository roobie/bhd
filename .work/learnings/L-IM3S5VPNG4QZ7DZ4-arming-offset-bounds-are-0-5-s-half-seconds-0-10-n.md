---
date: 2026-11-01
read_if:
  - changing arming pickers or intent offsets
refs:
  - src/client/shell/arming.ts
---

# L-IM3S5VPNG4QZ7DZ4 Arming offset bounds are 0..5 s (half-seconds 0..10), not plus-minus 5 s; derive every picker bound from the ARM_* constants

## Observation
The HUD guessed plus-minus 5 s; arming allows 0..5 s.

## Why it matters
Derive picker bounds from the ARM_* constants so they cannot drift from arming.
