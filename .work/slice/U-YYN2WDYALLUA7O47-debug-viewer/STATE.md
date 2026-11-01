---
phase: finalize
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude (agent)
created: 2026-11-01
success_criteria:
  - 'The deployed page (npm run build output) shows a read-only top-down canvas of a live Sim (lane, Ancient, heroes, enemies, hp bars, status letters), labelled "debug viewer — not the game client (wave 7)".'
  - 'Controls work: play/pause, step, speed 0.5x-8x, reset, seed input; HUD shows tick, wave, Ancient hp, counts, game result, Gunner heat bar (60/85/100 marks) and braced state; event log shows the last 20 wave/death/leak/end/ability events.'
  - 'Layout/colour/event-log helpers are in separate modules with node tests; a browser smoke test (chromium, firefox, webkit) proves the canvas draws and the tick advances.'
  - 'npm run ci is green (biome, tsc, knip, node and browser tests) and npm run build succeeds; nothing under src/sim, src/content or existing tests is modified.'
---

# slice/debug-viewer

## Purpose
Replace the wave-0 placeholder page with a plain read-only 2D debug viewer, so each wave's sim work is visible on the deployed Pages site until the real client (wave 7).

## Scope
In: src/client/** (app, draw, hud, view, colors, eventlog), index.html styles, vite.config.ts test project wiring, tests under test/client/.
Out: sending commands, any sim or content change, the real client, new dependencies.

## Context & constraints
Sim is fixed-tick (TICK_HZ 30), stepped here from requestAnimationFrame with an accumulator. Viewer only reads `sim.entities`, `sim.waves`, `sim.game`, `kit`. Pages deploy runs `npm run build` (tsc + vite build).

## Now
Opus review fixes applied; all criteria hold. Waiting for merge and close.

## Next
- Main agent merges the branch; finalize the slice.

## Evidence
- `npm run ci`: biome ci clean, tsc clean, knip clean, node 23 files / 356 tests, browser 12 files / 78 tests (chromium, firefox, webkit) all passed.
- `npm run build`: dist/index.html + one 41.9 kB JS bundle.
- test/client/helpers.test.ts (node): fitWorld, toScreen, colours, statusLetters, pushEvents.
- test/client/viewer.browser.test.ts (browser x3): canvas mounts, non-blank pixels, #tick increases, label and gunner heat meter element present, teardown called.

## Harvest
- [ ] learning: the node vitest project globs test/**/*.test.ts, so DOM-only tests need the `.browser.test.ts` suffix (excluded in vite.config.ts) and an entry in BROWSER_TESTS.
- [ ] backlog: the viewer is not screenshot-checked at phone width by a test; only CSS (width 100%, aspect-ratio) covers it.

## Log
- 2026-11-01 initialized
- 2026-11-01 executed: viewer built, ci green
- 2026-11-01 review fixes (teardown, seed validation, end reason, auto-pause on end, palette cache); phase finalize
