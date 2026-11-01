---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'buildHudModel invariants hold in Node tests: one card per hero slot, buttons equal abilities, fractions in [0,1], unknown ability/status/resource fall back, human-driven hero badged you'
  - createHud renders cards and ability buttons in a browser and a button click dispatches the matching UiAction
  - npm run ci exits 0
---

# slice/w7-hud

## Purpose
The kit-agnostic DOM HUD of the client shell (wave 7c): top bar, hero cards, ability bar, hint, end overlay, built from Perception plus presentation.

## Scope
In: `src/client/shell/{hudmodel,hud}.ts`, `hud.css`, their tests.
Out: intents list and arm picker views (`intentsui.ts`, arming slice), the reducer, the shell wiring.

## Context & constraints
Contracts in `types.ts` are final. Portrait first, landscape supported; 44 px touch targets; safe-area insets; re-render capped at 30 Hz. No gameplay pinning (D-4E4QRJ7N6LIGZDSD).

## Now
Implemented; gate run.

## Next
- Merge by the main agent.

## Evidence
- `test/client/shell/hudmodel.test.ts` (Node) and `test/client/shell/hud.browser.test.ts` (browser).

## Harvest
- [ ] backlog: no visual check of the layout at 390x844 and 1280x720 yet (only reasoned from the constants); screenshot check once the shell is wired
- [ ] backlog: picker reserve-offset bounds (-5..5 s) are a guess in hudmodel.ts; align with arming.ts once it lands
- [ ] process: hud.browser.test.ts needed an entry in BROWSER_TESTS in vite.config.ts, which the contracts slice did not list for this slice

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
