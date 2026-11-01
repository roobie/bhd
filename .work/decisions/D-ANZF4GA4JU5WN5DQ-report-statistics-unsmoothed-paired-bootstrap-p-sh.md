---
status: accepted
date: 2026-11-01
read_if:
  - changing how movers are ranked or filtered
  - p-values or CIs look degenerate
refs:
  - src/reporter/stats.ts#bootstrapMean
  - src/reporter/diverge.ts#findDivergence
---

# D-ANZF4GA4JU5WN5DQ Report statistics: unsmoothed paired bootstrap p, shared resamples, divergence for top movers only

## Context
Report movers must be ranked and noise-filtered from per-game paired values with few games and many series.

## Decision
p is the two-sided bootstrap p on paired deltas, unsmoothed, with every series reusing the same resample indices; Benjamini-Hochberg filters across series. A constant delta gives a zero-width CI and a constant base gives sd 0. Divergence (first differing tick) is computed for the top 10 movers only; choice series are ordinary series.

## Why
Shared resamples keep the report deterministic and cheap; unsmoothed p was chosen over adding pseudo-counts so resolution is honest (1/resamples). Divergence needs log reads, so limiting it bounds report time.

## Consequences
p cannot go below the resample resolution. Raising the mover count for divergence costs log decoding.
