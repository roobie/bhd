---
created: 2026-11-01
---

# B-NVNSIFPB5PAZFLUC State hash: guard NaN/non-finite; NaN-safe sort comparators

## Why
TODO: the need or problem, and who has it.

## Notes
TODO

Source (D=~/devel/skelly/deadvox, S=~/devel/skelly): D/docs/decisions/0008-deterministic-world.md warns NaN in comparators/hash; guard with Number.isFinite in src/sim/hash.ts.
