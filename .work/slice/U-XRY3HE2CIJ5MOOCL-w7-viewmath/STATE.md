---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - planFrame, takeSnapshot, advanceEffects, interpolate and fitCamera are implemented to the contract signatures in src/client/shell/types.ts
  - 'Node invariant tests pass: camera round trip and fit in both orientations, interpolation endpoints, frame step cap and alpha range'
  - npm run ci exits 0
---

# slice/w7-viewmath

## Purpose
The pure maths between the sim and the renderer: frame driver, snapshots and effects, interpolation, and the fit-and-rotate camera. Absorbs backlog B-C4FU2FN3T5OXCUTV.

## Scope
In: `src/client/shell/{frame,snapshot,interp,camera}.ts` and `test/client/shell/viewmath.test.ts`.
Out: scene, input, HUD, GL, wiring (other w7 slices). No gameplay pinning (D-4E4QRJ7N6LIGZDSD).

## Context & constraints
Signatures are fixed by the contracts slice. The renderer only reads sim state. Biome: max 4 params, no nested ternary, default switch clause.

## Now
Implemented; ci green.

## Next
- Lead merges; shell wiring (w7-shell) calls these.

## Evidence
- `npm run ci` exit 0; 27 tests in test/client/shell/viewmath.test.ts.

## Harvest
- [ ] learning: dead entities leave the sim in the tick they die, so `advanceEffects` can only place hit and death effects from the snapshot taken before the step; the wiring must pass that predecessor snapshot
- [ ] backlog: no automated check that the 90 degree clockwise rotation matches the GL clip matrix on a real canvas; cover in the shell browser test

## Log
- 2026-11-01 initialized
- 2026-11-01 implemented and tested
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
