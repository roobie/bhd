---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - All seven shapes draw at the SDF-expected pixels in Chromium, Firefox and WebKit (readback test); shader compile and link pass
  - createRenderer returns undefined (never throws) when WebGL2 is unavailable; context loss and restore flip lost and rebuild
  - DPR resize sets the backing store to round(css * dpr); InstanceBuffer grows and keeps the 12-float layout
  - npm run ci exits 0
---

# slice/w7-gl

## Purpose
The WebGL2 instanced SDF renderer of the client shell (wave 7, step 2a): one program, one instanced draw call, DPR resize and context loss handling.

## Scope
In: `src/client/gl/{context,shaders,renderer,instances}.ts`, `test/client/gl/instances.test.ts`, `test/client/gl.browser.test.ts`.
Out: scene building, camera math, anything under `src/client/shell/`.

## Context & constraints
Signatures and the instance layout come from `src/client/shell/types.ts` (unchanged). No gameplay pinning (D-4E4QRJ7N6LIGZDSD). Biome strict rules apply.

## Now
Implemented and green; finalizing.

## Next
- Main agent merges the branch.

## Evidence
- `npm run ci` exit 0: 686 node tests, 111 browser tests (3 browsers), including gl.browser.test.ts.
- Readback test passes in chromium, firefox and webkit (all three had WebGL2 headless here).

## Harvest
- [ ] learning: Biome noMisplacedAssertion rejects `expect` inside `it.runIf(...)` callbacks; guard with an early return instead.
- [ ] learning: arcs and sectors use approximate angular SDFs (angle times radius), fine for AA but not true distances.
- [ ] backlog: pixel-diff or screenshot goldens for the renderer once art direction settles (not before v1.0 gameplay rules apply to visuals only if pinned).

## Log
- 2026-11-01 initialized
- 2026-11-01 implemented renderer, shaders, context, tests
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
