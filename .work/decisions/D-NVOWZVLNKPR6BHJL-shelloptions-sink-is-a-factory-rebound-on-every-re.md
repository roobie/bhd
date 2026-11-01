---
status: accepted
date: 2026-11-01
read_if:
  - changing match restart or sink wiring
refs:
  - src/client/shell/app.ts
---

# D-NVOWZVLNKPR6BHJL ShellOptions.sink is a factory rebound on every restart, so a new match never inherits a stale sink

## Context
The shell restarts matches and each needs a fresh sink.
## Decision
ShellOptions.sink is a factory from match to CommandSink, rebound on every restart.
## Why
A single sink instance kept stale delayed commands across restarts.
## Consequences
Tests and wave 10 supply their own factories.