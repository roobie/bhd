---
date: 2026-11-01
read_if:
  - estimating batch time or sizing --games
  - worrying about perception cost in batches
refs:
  - src/perception/clumps.ts
---

# L-DAIL5WCXPWGRWVFA Batch cost: about 6 s for 200 games on 15 threads, and perception showed no hot spot

## Observation
A 100-pair quick batch (200 games) took about 6 s on 15 workers on a shared 16-core box, against the design's 4 s guess; report runs of the same size took about 10 s. Metrics cost 3 to 5 ms per game warm. No perception or clustering hot spot showed up, which settled the earlier worry about its O(n^2) cost in batches.

## Why it matters
Size --games from this; revisit if scenarios get denser or much longer. Not a profile of perception alone.
