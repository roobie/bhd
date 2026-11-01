---
created: 2026-11-01
---

# B-BQC4S6RAL3VPENHB GunnerView exposes brace facing and whether the brace is coming off

## Why
The Gunner brain remembers the brace aim in its own memory and infers "rooted but not braced" from statuses, because GunnerView does not expose either.

## Notes
Related to B-WRDUNPIWLBJMVY7N (shared entity facing). Touches src/perception/types.ts#GunnerView and src/bots/gunner.ts.
