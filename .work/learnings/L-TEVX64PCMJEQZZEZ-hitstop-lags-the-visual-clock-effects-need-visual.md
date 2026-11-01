---
date: 2026-11-01
read_if:
  - adding client effects, hitstop or animation clocks
refs:
  - src/client/shell/feedback.ts
---

# L-TEVX64PCMJEQZZEZ Hitstop lags the visual clock; effects need visual time too

Hitstop makes the visual clock lag real time by up to 200 ms. advanceEffects must get visual time as well as buildScene, or effects spawned during a freeze start out invisible for a moment.
