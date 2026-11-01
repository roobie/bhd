---
status: accepted
date: 2026-11-01
read_if:
  - adding a hero, kit, effect or status
  - adding perception fields for the client
refs:
  - src/content/presentation.ts
  - src/client/shell/hudmodel.ts
---

# D-KODXIPZFM5CSHCQ2 The HUD is kit-agnostic: Perception plus content presentation with fallbacks, and the shell never switches on hero, kit or effect names

## Context
New heroes, kits and effects arrive in waves 8 to 9; the client must not need edits per kit.
## Decision
The HUD reads Perception plus content/presentation with fallbacks; perception gained cooldown, marks and autocast fields.
## Why
Switching on names in shell code would drift from content; data-driven fallbacks keep unknown content rendering.
## Consequences
Adding a kit means a presentation entry, not shell changes; new HUD needs mean new perception fields.