---
date: 2026-11-01
read_if:
  - debugging canvas resize or DPR changes
refs:
  - src/client/shell/app.ts
---

# L-CU57C74NIRVM4ROF An inline px style on the canvas overrides CSS size and silences the ResizeObserver; resize only the backing store

## Observation
An inline px style on the canvas beat the CSS width and silenced the ResizeObserver; this was the high-severity wave 7 review finding.

## Why it matters
Size only the backing store and let CSS size the element.
