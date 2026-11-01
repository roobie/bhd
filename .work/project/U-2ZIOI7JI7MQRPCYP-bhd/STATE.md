---
phase: execute
owner:
  - B
  - claude
created: 2026-11-01
success_criteria:
  - 'M1 closed: `bhd report` diffs two Gunner builds into a readable report (see milestone/m1-reporter)'
  - 'M2 closed: solo, 2–4 player co-op and human wave master are playable (see milestone/m2-playable)'
---

# project/bhd

## Purpose
Build BHD (Bjorn's Hero Defense): a WC3-style, four-hero lane defense with deterministic lockstep co-op and an optional wave-master player, plus a diff reporter that shows how each change moves the game.

## Scope
In: everything in DESIGN.md (the original project-lead handoff): sim, bots, director, reporter, client, multiplayer.
Out: inventing full kits for heroes other than the Gunner without B's sign-off; extending `prototype/last-ancient.html`.

## Context & constraints
- DESIGN.md is the brief and must stay current: pillars (§2), locked decisions (§3), architecture and determinism rules (§6), milestones and waves (§7), way of working (§8).
- B owns design (mechanics, resources, heroes, pillar-level choices). Claude leads, delegates slices to subagents, tunes numbers freely.
- Waves run in order; a wave starts only when the previous wave's exit check passes. No two subagents own the same file in one wave.

## Now
Wave 0: scaffold closed; detmath and sim-core next.

## Next
- Pick off DESIGN.md §10 open questions as they become relevant (Q3 answered).
- Report to B at the end of each wave.

## Evidence
## Harvest
- [ ] decision: record each §3 locked decision as a D- record once code exists to `--ref` (rendering, 30 Hz deterministic sim, single command() path, WebRTC lockstep, CF signaling, bot "one brain", diff-reporter testing)
- [x] process: handoff said `docs/DECISIONS.md`; switched to dev-proc decision records (DESIGN.md updated)

## Log
- 2026-11-01 initialized from BHD-HANDOFF.md (moved here as DESIGN.md); created M1, M2, wave 0 and its four slices
- 2026-11-01 phase initialize → execute
