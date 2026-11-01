---
phase: execute
parent: U-AK7QYARYTSKYZFTE
owner:
  - claude
created: 2026-11-01
success_criteria:
  - '`npm run bhd -- report --base main --cand <heat-tweak branch> --tag gunner.heat` writes an HTML report and prints a summary table'
  - The report shows explainable movement for the heat tweak and flags at least one mover outside the change
  - '`bhd view <log> --tick T` opens the logged game in the debug viewer at T, hash-verified'
  - npm run ci green; batch output is byte-identical across worker counts
---

# wave/w3-reporter

## Purpose
Ship the M1 deliverable: a paired diff reporter that shows what a change moves (project DESIGN §6.5, §7 wave 5 items 5a–5f).

## Scope
In: headless runner and worker pool, event-log store, the §6.7 metrics, paired bootstrap diff, HTML and CLI report, replay links into the debug viewer.
Out: WebGL replay renderer (wave 7), the "adapted" column, canonical JSON for goldens, WebRTC fingerprint handshake.

## Context & constraints
See DESIGN.md. Determinism §6.1; Node code only in `src/reporter/`; no gameplay-pinning tests (D-4E4QRJ7N6LIGZDSD).

## Now
Step 3: Opus review of the integrated wave, then fixes.

## Next
- [x] Fix review findings plus: ranged stand-in logs mark options by entity id (`mark.<id>`), which floods movers; `bhd run` plays its side twice; `PURE_DIRS` duplicated in sides.ts.
- Close slices and wave; close M1.

## Evidence
- All five step-2 slices merged to main; CI green (657 node, 87 browser tests).
- `report --base HEAD --cand HEAD --games 20`: 438 series, 0 moved (null check holds).
- `report --base main --cand demo/heat-overpen-080 --tag gunner.heat` (100 pairs, ~10 s): HTML at `.bhd/reports/e0e1baaa750a/index.html` and a table; `gunner.heat.band[b85]` +37%, b60 −16%; 25 movers flagged `← outside change` (e.g. `outcome.leaks[w14]` −66%, `combo.rate[pull:w15:payoff]` +165%).
- `bhd view .bhd/runs/1f5c758fd1eb/base/1-5.ndjson.gz --tick 2038` resolves the base snapshot and serves the viewer at tick 2038.

## Harvest
- [ ] decision: `Option.label` (default id) is what `choice` events log, so ranged stand-in `mark.<entityId>` options log `mark` while ids still drive stickiness and emit-on-change; behaviour unchanged (golden state hashes identical, only `eventDigest` regenerated since choice events are in it)
- [ ] decision: choice events collapse options sharing a label into one entry with the best score
- [ ] decision: `MetricDef.areasOf(key)` gives per-hero areas from the key; `MetricDef.group(key)` makes choice.spread skip a pair at decision level when the decision is absent on a side
- [ ] decision: `report.json` has no wall time; `renderHtml(data, timing)` reads `timing.json`; `runBatch` merges per side and rewrites `timing.json` only when a game ran
- [ ] decision: `bhd run` passes no `cand` to `runBatch` (`BatchPlan.cand` optional)
- [ ] decision: `PURE_DIRS` lives in `src/match/pureDirs.ts` (test/ cannot import src/reporter by the layering test)
- [ ] decision: the viewer stops at `header.ticks` of a replayed log, and `recordLive` ignores checkpoints past it
- [ ] learning: pool workers need an `exit` handler with a job in flight, else a silent exit hangs the batch

## Log
- 2026-11-01 initialized; design from an Opus planner; lead decisions: doctrine noise 0.05, intent fulfil as combo proxy
- 2026-11-01 phase initialize → execute
- 2026-11-01 review fixes (15 items) applied; ci green (670 node, 87 browser tests)
