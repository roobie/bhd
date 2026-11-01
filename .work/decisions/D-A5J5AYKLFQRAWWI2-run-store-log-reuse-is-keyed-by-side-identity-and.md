---
status: accepted
date: 2026-11-01
read_if:
  - touching run keys, caching or timing.json
  - report.json differs between runs or worker counts
refs:
  - src/reporter/store.ts#runKey
  - src/reporter/pool.ts#runBatch
  - src/match/pureDirs.ts#PURE_DIRS
---

# D-A5J5AYKLFQRAWWI2 Run store: log reuse is keyed by side identity and spec, and report.json carries no wall time

## Context
Batches are rerun often with one side unchanged, and the report must be byte-identical across worker counts.

## Decision
A run key hashes the side fingerprint and the stable-stringified spec; a batch dir is keyed by scenario and both side identities. A worker reuses an existing log and recomputes metrics from the decoded file, so cached and fresh values agree. report.json holds no wall time; timing.json is merged per side and rewritten only when a game ran, and the HTML reads it.

## Why
Keying on identity rather than path makes reruns near-free (200 logs reused in a fraction of a second). Wall time in report.json would break the byte-identical check. Reuse inside the worker rather than the pool keeps the metric path single. Refs are verified before archiving (the target's RUN_ABI must match this checkout). bhd run passes no cand, since a single side needs no pair. PURE_DIRS lives in src/match/pureDirs.ts because the layering test forbids test/ importing the reporter and src must not import test/.

## Consequences
RunDone.cached is an additive deviation from the original contracts. Changing the spec encoding invalidates every cached log.
