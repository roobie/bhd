---
status: accepted
date: 2026-11-01
read_if:
  - giving a bot new information
  - adding a bot kit or touching the layering test
refs:
  - src/perception/perceive.ts#perceiveMaster
  - src/bots/types.ts#BotCtx
  - src/bots/types.ts#BrainTable
---

# D-ABIU2YALDBBGMWAR Bots see Perception and nothing else; the Director gets its own MasterView

## Context
Bots must play like players with limited senses, and bot logic must stay deterministic and replayable from the command log alone. The Director needs wave-master facts (budget, costs, unlocks) that hero bots must not have.

## Decision
Brains read one deep-frozen Perception through their context and act only by emitting commands. The Director reads a separate MasterView. Brains are bound per seat from per-kit factories so tests can inject probes, and the layering test restricts what bots and the Director may import from the sim.

## Why
Giving brains the Sim or a shared view would leak information and make the command log insufficient to replay a game.

## Consequences
New information for a bot means a new Perception field, never a sim import. Kit weights reach brains as data through the context.
