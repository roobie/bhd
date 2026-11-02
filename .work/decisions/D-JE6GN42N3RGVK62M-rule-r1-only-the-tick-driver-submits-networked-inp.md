---
status: accepted
date: 2026-11-02
read_if:
  - calling sim.command for a human or system player, or touching beforeStep, seals or seq order
refs:
  - src/sim/sim.ts
  - src/client/shell/types.ts
---

# D-JE6GN42N3RGVK62M Rule R1: only the tick driver submits networked inputs, in seal order

## Context
Commands apply in (player, seq) order and seq is the order of submission on each peer (D-ZWZVLE5U4MRETLI7). Two peers that submit the same inputs in a different arrival order would assign different seqs and diverge silently until the next hash checkpoint.

## Decision
In networked mode, outside Match.step and beforeStep, nobody calls sim.command. The driver's beforeStep(T) submits tick T's sealed inputs in seal order (player, then send order); Match.step submits the bots' own commands. Those happen during earlier steps than T's, so they come first on every peer. The rule is documented on Sim.command.

## Why
The alternative is to push inputs into the sim as they arrive and hope orders match; arrival order differs between peers. Submitting at a single point, from a list every peer holds identically, makes the seq assignment a function of the seal alone.

## Consequences
The local player's own input also goes through the driver (it is submitted to the host and comes back sealed). Any stray sim.command in a networked game is a desync, detected at the next hash tick. The driver tests must randomise arrival order. localDriver keeps the immediate path for solo play.
