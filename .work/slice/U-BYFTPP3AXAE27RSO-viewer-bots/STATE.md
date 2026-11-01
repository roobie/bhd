---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - claude (agent)
created: 2026-11-01
success_criteria:
  - npm run ci exits 0, including the browser smoke test
  - The viewer runs an all-bot Match (Director on by default, schedule mode selectable) on load, with no human commands
  - Controls for seed, mode, doctrine per seat, reaction delay and think cadence reset the game, are validated, and round-trip through the URL hash
  - Overlays (posts and leash, move targets, threat rings, clumps, combo windows, intents, overpen line) are toggleable; bot panel, Director panel and filtered event log mount
  - Pure helpers (config/hash, panel math, log, colours) live in their own modules with tests; no gameplay assertions
---

# slice/viewer-bots

## Purpose
Let B watch a full all-bot game on the debug viewer, with the bots' decisions, intents and the Director made visible.

## Scope
In: `src/client/*`, `test/client/*`, `index.html`.
Out: any change to match, perception, bots or director; human commands.

## Context & constraints
Coded against shapes only (Match getters, Perception, MasterView, DirectorStatus); other slices are filling the stubs, so every list may be empty. Render reads memoised getters only.

## Now
Done; criteria hold. Not closed.

## Next
- Lead: watch on Pages after merge and tune overlay scales (threat ring radius, clump radius) against real perception numbers.

## Evidence
- `npm run ci` exit 0: node 465 tests / 29 files, browser 81 tests / 12 files.
- New: config.ts (hash/validation), setup.ts (config -> Match), panelmath.ts, overlay.ts, panels.ts; eventlog.ts gained cmd/choice/intent lines and filters; tests in test/client (config, panelmath, helpers, browser smoke extended for panels, overlays, filters).

## Harvest
- [ ] decision: viewer config lives in the URL hash as `seed, mode, doc (4 doctrine ids), react, think`; invalid fields fall back to defaults, invalid inputs revert to the current value. Overlay toggles and log filters are not in the hash and do not reset the game.
- [ ] decision: move targets come from `HeroView.dest`; when absent, the last applied `move` cmd event is drawn faded for 2 s.
- [ ] decision: intent colour state is derived from `IntentView` (fired, else reservers non-empty = reserved, else posted); the overpen line is drawn for heroes with `gunner` set and a target, red when `lineAllies` is non-empty.
- [ ] decision: one reaction-delay control applies to all four seats; the Director keeps its own default delay.
- [ ] learning: render calls `match.perception` each frame, which computes perception on non-think ticks too; harmless (memory folds every tick) but costs a perceive per rendered tick when overlays are on.
- [ ] backlog: tension sparkline is sampled in the viewer (0.5 s) since `DirectorStatus` has no history; the Director could expose one.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize -> execute
- 2026-11-01 viewer built on Match, helpers and tests, ci green
- 2026-11-01 phase execute -> finalize
