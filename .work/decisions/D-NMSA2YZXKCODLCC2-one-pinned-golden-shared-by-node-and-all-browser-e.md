---
status: accepted
date: 2026-11-01
read_if:
  - the determinism golden test fails
  - changing sim behaviour, scenario or detmath output
refs:
  - test/determinism/golden.ts
  - test/determinism/scenario.ts
---

# D-NMSA2YZXKCODLCC2 One pinned golden shared by Node and all browser engines

## Context
Lockstep co-op needs bit-identical results across Node (bots, reporter) and the browsers peers run: V8, SpiderMonkey and JavaScriptCore.

## Decision
One pinned golden (scenario event digest, hash sequence, detmath sweep digest) is asserted by the Node project and by chromium, firefox and webkit in the browser project.

## Why
Comparing each engine to the same pinned value proves cross-engine equality without running engines against each other, and also catches drift over time on a single engine. Self-consistency runs alone (same seed twice) cannot catch either.

## Consequences
Any intended change to sim behaviour, the scenario or detmath output means regenerating the golden with `npm run golden`. That invalidates stored replays, so the commit message must say so.
