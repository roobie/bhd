---
created: 2026-11-01
---

# B-ZCO2ETTNXWGZHXTM Measure perception cost in deep batches (clustering is O(n^2))

## Why
Perception was timed only on one dense scene (100 enemies, about 0.04 ms per call). Clustering is O(n^2), and the viewer also computes perception per rendered tick when overlays are on, so batch runs with many bots and seeds may pay more than measured.

## Notes
Measure in the wave-3 reporter batches; see src/perception/clumps.ts.
