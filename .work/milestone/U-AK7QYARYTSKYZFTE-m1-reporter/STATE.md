---
phase: execute
parent: U-2ZIOI7JI7MQRPCYP
owner:
  - B
  - claude
created: 2026-11-01
success_criteria:
  - '`bhd report --base A --cand B --tag gunner.heat` writes an HTML diff report and prints a summary table'
  - Determinism test passes in Node and in a browser (same seed + commands → identical hash sequence)
  - A Gunner heat tweak shows visible, explainable movement, including at least one flagged outside-the-change metric
---

# milestone/m1-reporter

## Purpose
Framework through reporter: the deterministic sim, bots and director exist so the reporter can show what a change moves. See project DESIGN.md §6 and §7 (Milestone 1).

## Scope
In: waves 0–5 (foundations, content+combat, perception, bots+intents, director, reporter + minimal replay viewer).
Out: playable client, multiplayer, non-Gunner hero kits (stand-ins only).

## Context & constraints
Determinism rules in DESIGN.md §6.1 are pass/fail. Stand-in heroes are placeholders with no invented resources.

## Now
Wave 0 initializing.

## Next
- w0-foundations
- Waves 1–5: create each wave unit when the previous one closes.

## Evidence
## Harvest
## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
