---
status: accepted
date: 2026-11-01
read_if:
  - the browser determinism test fails
  - changing sim behaviour, the scenario or detmath output
  - tempted to commit a hash list
refs:
  - vite.config.ts
  - test/determinism/scenario.ts
  - test/determinism/reference.setup.ts
supersedes:
  - D-NMSA2YZXKCODLCC2
---

# D-V4TA7WE5J4QC24D3 Determinism spec is cross-runtime equality computed at test time, no committed golden

## Context
Lockstep co-op needs bit-identical results across Node (bots, reporter) and the browsers peers run: V8, SpiderMonkey and JavaScriptCore. The first answer was a committed golden hash list asserted everywhere. B judged that gameplay pinning: it churns on every sim, bot or content change and must be regenerated and hand-merged between parallel slices.

## Decision
The determinism spec is cross-runtime equality. A Vitest globalSetup runs the shared scenario on Node and provides the result to the browser tests, and chromium, firefox and webkit assert their own run equals it. Node tests check run-twice equality and hash sensitivity. Nothing is committed.

## Why
Equality between engines is the lockstep property; a pinned value adds only drift detection over time on one engine, which replay equality and run-twice already cover. Rejected: keeping a pinned golden (churn, merge conflicts), and a golden regenerated only at integration (still a pin).

## Consequences
Sim changes need no regeneration step. Stored replays and seed-paired reports still go stale on any sim change; that is tracked by the fingerprint backlog item, not by a test. CI fails if any browser diverges from Node.
