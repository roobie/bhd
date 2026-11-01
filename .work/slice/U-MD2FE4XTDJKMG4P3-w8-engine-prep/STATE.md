---
phase: finalize
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - npm run ci exits 0 with the regenerated golden (hashes moved because of new hashed fields and the new lineup and scenario)
  - 'Engine hooks exist: damageTaken (same-team ff floor), healTaken, kit RNG via deriveRng (hashed), prop entity + firstBarrier, respawn, callWave, leash from rules'
  - New kits (penitent, psyker) are wired but inert; the Gunner slot 2 def is pavise; defaultGame lineup is Gunner, Penitent, Psyker, Support
  - An all-bot game runs 15 waves on the new lineup without throwing; client builds with UiAction callWave and Effect kinds respawn and prop
  - Step-2 slices (A-G) can each work in their own files only
---

# slice/w8-engine-prep

## Purpose
Step 1 of w8 (solo playable): land every shared engine, type, content and client hook so the step-2 slices touch only their own files.

## Scope
In: sim hooks (damageTaken, healTaken, kit rng, props, respawn, callWave, leash), kit stubs and content defs for Penitent and Psyker, Pavise def, rules content, perception fallen view and kit parts, shell types, scenario and golden.
Out: Penitent and Psyker behaviour, bot brains, Pavise bot decision, real help and icon art, feedback and audio, reporter metrics.

## Context & constraints
No gameplay pinning: engine-spec tests assert mechanics only. Banned-API and determinism checks stay green. Golden is regenerated in this slice only.

## Now
Finalizing: CI gate and commit.

## Next
- Step 2 slices A-G.

## Evidence
- npm test: all files pass; knip clean; biome and tsc clean.
- All-bot Match over 15 waves (master and solo) completes without throwing.

## Harvest
<!-- Candidates found along the way. -->
- [ ] learning: a kit's extra state must be hashed through its own hashX plus KitBase once (hashKit); the hash test cycles kit kinds.
- [ ] learning: Biome useMaxParams 4 pushes kit functions to a single run object `{ctx, hero, kit, def}`.

## Log
- 2026-11-01 initialized
- 2026-11-01 execute: engine hooks, stubs, content, perception, shell wiring, scenario extended, golden regenerated
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
