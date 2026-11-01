---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - buildScene emits finite instances with known shape ids for a real perception, in painter order, bounded per entity
  - bodies, pips and markers honour MIN_BODY_PX via camera.pxPerUnit; unknown hero/enemy/status ids fall back without errors
  - scene tests pass and npm run ci exits 0
---

# slice/w7-scene

## Purpose
Turn drawn entities, perception and controls into SDF instances so the renderer can draw the match (wave 7a).

## Scope
In: src/client/shell/scene.ts, palette.ts, test/client/shell/scene.test.ts.
Out: intentfx (arming slice), renderer, camera.

## Context & constraints
Contracts in types.ts are fixed. Colours via palette and presentation fallbacks only. No gameplay pinning (D-4E4QRJ7N6LIGZDSD).

## Now
Implemented and tested.

## Next
- Merge; verify visually once camera and renderer land.

## Evidence
7 scene tests; npm run ci exit 0.

## Harvest
- [ ] learning: scene tests mock intentfx via vi.mock while it is a stub; drop the mock once arming lands
- [ ] backlog: tickF passed to intentInstances is p.tick (SceneInput has no alpha); add a fractional tick to SceneInput for smooth rings
- [ ] backlog: cone previews use a generic half angle; derive from perception cone data once kit-agnostic

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
