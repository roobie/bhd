---
date: 2026-11-01
read_if:
  - writing a metric that tracks alive enemies
refs:
  - src/reporter/metrics/registry.ts#computeMetrics
---

# L-M5O2WUFF7UPGDBEH A leak removes an enemy without a death event

## Observation
The sim removes a leaking enemy with a leak event and no death event.

## Why it matters
Alive-enemy and hp tracking in metrics must handle leak as well as death.
