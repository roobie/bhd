---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Every step-2 file exists as a stub with its final signature, and `src/client/shell/types.ts` holds the shared contracts; `npm run ci` is green
  - Perception gains `AbilityView.cooldownTicks`, `ResourceView.marks`, `HeroView.autocast` and `GameSpec.humans`; engine-behaviour tests pass and `test/determinism/golden.ts` is unchanged
  - '`src/content/presentation.ts` has completeness and fallback tests; `play.html` loads, builds and is a knip and vite entry; `index.html` still works'
---

# slice/w7-contracts

## Purpose
Fix the interfaces of wave 7 so seven step-2 slices can build in parallel without touching each other's files.

## Scope
In: shell types.ts; stubs with final signatures; presentation content; additive perception fields; GameSpec.humans; play.html; vite and knip entries; tests for the new fields, humans and presentation.
Out: any behaviour of the stubbed modules.

## Context & constraints
See the wave DESIGN. Sim stays pure; golden unchanged; no gameplay-pinning tests.

## Now
Done; in finalize for the lead to merge.

## Next
- Lead merges, briefs the step-2 slices.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- `npm run ci` exit 0: node 684 tests, browser 87 (29 x 3 engines), biome, tsc, knip clean.
- `npm run golden` leaves `test/determinism/golden.ts` byte-identical (no diff).
- `vite build` emits `dist/index.html` and `dist/play.html`.
- New tests: 4 perception (cooldownTicks, marks, autocast), 4 humans (run.test.ts), 6 presentation.

## Harvest
- [ ] decision: UiAction carries world coordinates only; the HUD gets `screenToWorld` through `HudDeps` for button-drag casts
- [ ] decision: `cast` carries `arm?: boolean` so Alt+key is one action, and arming returns `ArmStep` with `handled` so controls can delegate
- [ ] learning: knip needs the stub files as entries until play.html's module graph reaches every file; remove the `src/client/{shell,gl}/*.ts` and presentation entries at step 3
- [ ] learning: isolated worktree agents have Bash refused for heredocs and variable-expanded commands; use Write/Edit and python one-offs with literal paths
- [ ] backlog: `Match.perception` is computed per tick on demand; the shell calls it every tick, so measure the cost on phones

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 contracts, stubs, perception fields, humans, presentation, play.html done; ci green
- 2026-11-01 phase execute → finalize
