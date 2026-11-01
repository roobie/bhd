---
created: 2026-11-01
---

# B-BIT4ANT4ZM7REGFT Prune existing gameplay-pinning tests

## Why
D-4E4QRJ7N6LIGZDSD: no gameplay pinning before v1.0. Wave-0/1 tests assert gameplay (Gunner heat/pierce/overpen numbers, stand-in abilities, enemy aggro/leash, combat armour/status maths, default-game reaches wave 3), so every tweak breaks them.

## Notes
Keep: determinism golden, replay equality, hash coverage, purity scan, detmath vectors, command shape checks, no-crash/NaN fuzz. Delete or reduce the rest to "runs without throwing"; prefer converting a useful scenario into a report input.
