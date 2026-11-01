---
status: accepted
date: 2026-11-01
read_if:
  - adding or changing deterministic math functions
refs:
  - src/detmath/index.ts#sin
  - src/detmath/index.ts#atan2
---

# D-MOXM2Y76JJ4SZP2F fdlibm-derived polynomial trig instead of tables

## Context
Engine Math.sin/cos/atan2 may differ across browsers, which breaks lockstep.

## Decision
Trig uses range reduction plus fdlibm's minimax kernels and atan, written with only exact IEEE ops.

## Why
About 1 ulp accuracy with a testable bound and no table memory or interpolation error. Lookup tables were the alternative: coarser, and their interpolation error shows up in aim and movement.

## Consequences
Accuracy degrades (stays deterministic) for angles beyond about 1.6e6 rad; callers should keep angles wrapped. New functions such as exp or pow must follow the same approach.
