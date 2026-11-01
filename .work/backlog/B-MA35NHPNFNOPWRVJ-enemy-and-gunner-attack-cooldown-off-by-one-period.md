---
created: 2026-11-01
---

# B-MA35NHPNFNOPWRVJ Enemy and Gunner attack cooldown off-by-one: period is ticks+1

## Why
enemies.ts attack cooldown has the same decrement-then-return off-by-one (period ticks+1) as the old stand-in attack; test/sim/heroes.test.ts also encodes +1 for the Gunner.

## Notes
Fix together with the test expectation; shifts the golden.
