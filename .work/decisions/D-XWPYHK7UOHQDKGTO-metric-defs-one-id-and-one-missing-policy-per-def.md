---
status: accepted
date: 2026-11-01
read_if:
  - adding or changing a reporter metric
  - a metric shows odd values for games that end early
refs:
  - src/reporter/metrics/registry.ts#METRICS
  - docs/METRICS.md
---

# D-XWPYHK7UOHQDKGTO Metric defs: one id and one missing-policy per def, per-wave series skip unreached waves

## Context
A MetricDef has one id and one missing-policy, yet some metrics need two policies or per-hero and per-wave keys.

## Decision
Metrics that need two policies are two defs (ability casts/value, intent fulfil/latency). Per-wave series skip unreached waves instead of counting zero; counts and shares use zero. MetricDef.areasOf and MetricDef.group let the reporter attribute keys to heroes and skip pairs absent on one side.

## Why
Counting an unreached wave as 0 makes a change that ends games earlier look like it fixed leaks. Splitting defs keeps types.ts unchanged. Team hp is heroes only; the Ancient has its own series. The fulfilling hero's latest cast value stands in for combo payoff because intents have no combo object yet. Ultimate slot comes from a kit table with the highest slot as fallback for stand-ins.

## Consequences
New metrics follow the same two rules. Helpers inside the metrics dir stay module-private or knip fails.
