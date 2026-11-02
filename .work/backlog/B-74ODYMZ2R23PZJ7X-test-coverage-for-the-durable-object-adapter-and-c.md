---
created: 2026-11-02
---

# B-74ODYMZ2R23PZJ7X Test coverage for the Durable Object adapter and coop.ts

## Why
The pure room machine is unit tested, but the Durable Object adapter in worker/index.ts and the shell wiring in coop.ts are covered only by the manual two-tab script, which is outside CI.

## Notes
Consider a fake Durable Object state for the adapter and a fake transport for coop.ts. Do not pin gameplay.
