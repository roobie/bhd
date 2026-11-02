---
date: 2026-11-02
read_if:
  - adding sim state or tick context fields
refs:
  - src/sim/bargains.ts
---

# L-ZVJXTR56UAAXHAGT A required field on TickContext or HashedState forces edits in hand-built test fixtures

## Observation
Adding a required field to TickContext or HashedState (w9 bargains, mods) broke many hand-built test fixtures at once.

## Why it matters
When a contract adds sim state or context fields, list the fixtures that build these by hand, or provide a shared fixture builder, so parallel slices don't each rediscover it.
