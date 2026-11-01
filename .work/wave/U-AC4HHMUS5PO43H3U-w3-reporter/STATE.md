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
Step 1: contracts slice.

## Next
- Step 2: parallel slices runner, metrics, stats+report, cli, replay.
- Step 3: lead integration and the heat-tweak demo.

## Evidence

## Harvest

## Log
- 2026-11-01 initialized; design from an Opus planner; lead decisions: doctrine noise 0.05, intent fulfil as combo proxy
- 2026-11-01 phase initialize → execute
