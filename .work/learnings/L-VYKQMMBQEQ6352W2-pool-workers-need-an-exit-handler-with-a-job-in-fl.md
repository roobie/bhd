---
date: 2026-11-01
read_if:
  - a batch hangs with no error
refs:
  - src/reporter/pool.ts#runBatch
---

# L-VYKQMMBQEQ6352W2 Pool workers need an exit handler with a job in flight

## Observation
A worker that exits silently while holding a job leaves the batch waiting forever; look at the exit and error handlers in the pool.

## Why it matters
Any new pool or worker path must settle the in-flight job on exit.
