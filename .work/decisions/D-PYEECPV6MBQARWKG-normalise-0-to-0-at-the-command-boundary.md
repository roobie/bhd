---
status: accepted
date: 2026-11-01
read_if:
  - adding a command kind or numeric command field
  - a replay or peer desyncs on float bits
refs:
  - src/sim/commands.ts#canonicalCommand
---

# D-PYEECPV6MBQARWKG Normalise -0 to 0 at the command boundary

## Context
Commands travel as JSON (replays, lockstep transport), and JSON turns -0 into 0, while the state hash compares exact float bits. A sender that applied -0 locally would diverge from every peer that received 0.

## Decision
Every command is canonicalised once when it enters the sim, and -0 becomes 0 before it is applied or logged.

## Why
Doing it at the boundary (rather than in each system, or by switching to a sign-preserving encoding) gives one choke point that local play, replays and the network all pass through. A binary encoding was deferred: JSON stays debuggable.

## Consequences
New command kinds and numeric fields must go through the canonicaliser (the exhaustiveness check catches new kinds; new optional fields are not caught). Sim code may still produce -0 internally; only inputs are canonical.
