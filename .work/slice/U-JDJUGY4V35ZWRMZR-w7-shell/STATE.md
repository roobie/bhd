---
phase: finalize
parent: U-WRCOBBQF2BA7YLWH
owner:
  - claude
created: 2026-11-01
success_criteria:
  - '`mountShell` builds the match from `GameSpec` with `humans`, sends commands through `localSink` (INPUT_DELAY_TICKS 3), runs a rAF loop with `planFrame`, wires HUD and resize, and falls back to the "WebGL2 unavailable" message when the renderer or a stubbed module fails'
  - '`parseShellHash` / `serialiseShellHash` round-trip and bad input gives defaults (node test)'
  - A driven game replayed from its recorded sink commands gives identical state hashes (node test, headless)
  - The shell browser test mounts with injected now/schedule and disposes cleanly in chromium, firefox and webkit; `npm run ci` exits 0
---

# slice/w7-shell

## Purpose
Wire the wave 7 client shell: entry, config hash, local sink and the app that joins match, frame loop, renderer, input and HUD through the contract signatures.

## Scope
In: `src/client/shell/{main,app,config,sink}.ts`, the play link in the debug viewer, tests under `test/client/shell/` and `test/client/shell.browser.test.ts`.
Out: the other step-2 modules (gl, viewmath, scene, input, hud, arming).

## Context & constraints
Contracts are merged; the other step-2 modules are stubs in this tree and land in parallel. No gameplay pinning (D-4E4QRJ7N6LIGZDSD).

## Now
Implemented and green; in finalize.

## Next
- Lead merges and runs the step-3 demo once all slices are in.

## Evidence
- `npm run ci` exit 0: node 697 tests, browser 90 tests (3 engines), with the stub modules.

## Harvest
- [ ] backlog: the HUD re-renders on a dirty flag set by every dispatch as well as on tick change, so pause and selection show while paused; the contract text said at most once per tick
- [ ] backlog: HUD insets use zero safe-area insets; read `env(safe-area-inset-*)` (e.g. from computed style of a probe element) when phone play is checked
- [ ] backlog: a failure after the renderer exists (any setup throw) shows the WebGL2 message with the real error only in `data-detail`; a distinct generic error panel would be clearer

## Log
- 2026-11-01 initialized
- 2026-11-01 implemented app, config, tests; play link in viewer
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
