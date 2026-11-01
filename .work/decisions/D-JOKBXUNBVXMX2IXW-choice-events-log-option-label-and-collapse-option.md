---
status: accepted
date: 2026-11-01
read_if:
  - choice series look flooded or mismatched between sides
  - adding bot options with per-entity ids
refs:
  - src/reporter/metrics/registry.ts#METRICS
---

# D-JOKBXUNBVXMX2IXW Choice events log Option.label and collapse options sharing a label

## Context
Ranged stand-ins give each target its own option id (mark per entity), which flooded the choice series with ids that differ between sides.

## Decision
Option.label (default the id) is what choice events log; ids still drive stickiness and emit-on-change. Options sharing a label collapse into one entry carrying the best score.

## Why
Logging ids made every entity a separate series and fake movers; labelling keeps bot behaviour unchanged (golden state hashes identical, only eventDigest regenerated).

## Consequences
Bots that want per-target stickiness but a stable report name set a label. Choice lines then read as decision pairs such as mark vs wait.
