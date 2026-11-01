---
date: 2026-11-01
read_if:
  - using SDF distances for anything but coverage
refs:
  - src/client/gl
---

# L-UIDNYOGG4P5XFB6F Arc and sector SDFs use approximate angular distance (angle times radius): fine for antialiasing, not true distances

## Observation
Angular SDFs multiply angle by radius.

## Why it matters
Fine for antialiasing, wrong for any consumer wanting true distance.
