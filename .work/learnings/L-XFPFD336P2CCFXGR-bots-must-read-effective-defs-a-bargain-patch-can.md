---
date: 2026-11-02
read_if:
  - adding a bargain or def patch that a bot reasons about
  - bot underperforms after a def change
refs:
  - src/bots/gunner.ts
  - src/perception/kits/gunner.ts
---

# L-XFPFD336P2CCFXGR Bots must read effective defs: a bargain patch can invert a kit ramp the bot assumed ordered

## Observation
Iron Discipline moved the Gunner's pierce threshold above her overpen threshold and zeroed overpenAllies. The bot's line-risk ramp assumed pierce < overpen and ignored overpenAllies, so it held fire as if the line hurt allies at all heats. This alone made bots that accept bargains play worse; the first batch read it as balance.

## Why it matters
Any def patch a bot reasons about can break ordering or zero-value assumptions in perception and bot code. When a bargain batch looks like balance, first check that bots read the effective def (heroDef) and guard degenerate ranges. Stops being true if bots stop deriving behaviour from kit knobs.
