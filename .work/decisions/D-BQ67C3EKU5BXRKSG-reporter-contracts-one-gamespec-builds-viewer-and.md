---
status: accepted
date: 2026-11-01
read_if:
  - changing GameSpec, overrides or the log header/codec
  - adding a reporter type or moving Mode/spec mapping
refs:
  - src/match/run.ts#runGame
  - src/content/overrides.ts
  - src/replay/log.ts
  - src/reporter/types.ts
  - src/client/setup.ts#specFromConfig
---

# D-BQ67C3EKU5BXRKSG Reporter contracts: one GameSpec builds viewer and batch Matches, log header is self-describing

## Context
The viewer and the headless reporter must build identical Matches, and a stored log must be replayable without outside knowledge.

## Decision
A single GameSpec (match/run.ts) is the only way to build a Match; the viewer config maps to and from it in client/setup.ts. The log header carries the resolved spec, so a log alone rebuilds its game.

## Why
Duplicating Match construction in the reporter would let viewer and batch drift, and replay would then verify nothing. Mode lives in match/, so match/ never imports the client. src/replay joined the purity-scanned dirs because replay must be deterministic too. Overrides stay strict (a director patch without director mode throws; only arrays of id-keyed entries patch by id, others replace whole) so a typo in a candidate cannot silently become a no-op. Header end reason may be 'maxTicks', and the director is absent in schedule mode. types.ts fixes the pool messages and batch shapes beyond the design table so the step-2 slices could run in parallel.

## Consequences
Any new way to build a game goes through GameSpec. Doctrine noise 0.05 moved every Match digest, hence the golden regeneration (see the learning on bot tweaks and goldens).
