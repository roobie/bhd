---
status: accepted
date: 2026-11-01
read_if:
  - changing hero selection, picking or touch targets
refs:
  - src/client/shell/controls.ts
  - src/client/shell/camera.ts
---

# D-F24EH2ANV3CE4LAV A pick selects only a driven hero, and a map point lies inside the camera free rect so HUD panels never swallow map clicks

## Context
Taps and clicks hit both heroes and HUD panels over the map.
## Decision
A pick switches selection only to a driven hero; a bot hero is a move target. Map points must be inside the camera free rect and the map; HUD panels do not pass clicks to the map.
## Why
Selecting bots would let a player command them; panels over the map caused phantom commands.
## Consequences
Solo hero switching (wave 8) extends the driven set.