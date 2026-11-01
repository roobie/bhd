---
status: accepted
date: 2026-11-01
read_if:
  - adding hashed sim state that only some game modes use
  - golden hashes change for every scenario
refs:
  - src/intents/board.ts#hashIntents
  - src/sim/master.ts#hashMaster
---

# D-ZWNGECNLCCFS7N6A Board and master hash sections carry a presence flag

## Context
Intents board and master state only exist in some game modes, but all sim state must be hashed (see L-53OTZPIIVO2XYNNL). A first attempt hashed them only once used, to keep schedule-mode hashes byte-identical.

## Decision
Each section is always preceded by a presence flag, whether or not the state exists.

## Why
The hash-only-once-used trick makes the hash layout depend on runtime history, which is fragile and hard to review. A one-time change of every hash is cheaper than that.

## Consequences
All pinned hashes changed once when this landed. New optional sim state should follow the same presence-flag pattern.
