---
created: 2026-11-01
---

# B-6U625W2HVLLTIHPS Drop or give meaning to dead perception config comboWindowSeconds

## Why
comboWindowSeconds in the perception content is unused; combo windows use status expiry instead.

## Notes
Giving it a meaning needs first-seen memory keyed by zone. See src/content/perception.ts.
