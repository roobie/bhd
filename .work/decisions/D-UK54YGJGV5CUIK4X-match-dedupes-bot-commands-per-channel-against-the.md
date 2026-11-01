---
status: accepted
date: 2026-11-01
read_if:
  - a bot re-issues the same command every think
  - changing reaction delay or command flow in Match
refs:
  - src/match/match.ts#Match
  - src/bots/types.ts#InFlight
---

# D-UK54YGJGV5CUIK4X Match dedupes bot commands per channel against the seat's in-flight commands

## Context
Bots think on a cadence and commands take effect after a reaction delay, so a brain that keeps wanting the same thing re-issues it every think while the first is still pending.

## Decision
Match suppresses a command equal to the seat's most recent pending command on the same channel. Brains also receive copies of their pending commands so they can avoid racing themselves. A decision absent from a think is forgotten, so its next appearance emits a choice event again.

## Why
Deduping in Match keeps the command log clean for every brain at once; relying on each brain to track its own pending state was error-prone.

## Consequences
Rejected commands are not recorded. A brain that wants to change its mind within the delay must change the command, not repeat it.
