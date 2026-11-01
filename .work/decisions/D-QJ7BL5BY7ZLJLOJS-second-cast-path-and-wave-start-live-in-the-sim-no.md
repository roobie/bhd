---
status: accepted
date: 2026-11-01
read_if:
  - adding a way for the board or a bot to cast or start a wave
  - hitting a biome import-cycle error between commands and the board
refs:
  - src/sim/sim.ts#Sim
---

# D-QJ7BL5BY7ZLJLOJS Second cast path and wave start live in the sim, not in bots or master.ts

## Context
The intents board must make a hero cast (fire of a pull intent) and the wave master must start a wave, but both need the command applier, while the command applier already imports the board and master. Biome forbids import cycles.

## Decision
The sim builds the single second cast path into the tick context, reusing the normal command path and reading success from the kit's own ability event. Starting a wave is called from the command side, with the master only returning the wave definition.

## Why
Alternatives were a cast helper inside the commands module, or the master starting waves itself; both create a value-import cycle. Reusing the command path also keeps hero kits untouched.

## Consequences
Anything new that needs to cast or start a wave goes through the context, not through a new import edge.
