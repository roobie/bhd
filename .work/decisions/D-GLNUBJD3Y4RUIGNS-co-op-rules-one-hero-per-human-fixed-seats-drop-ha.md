---
status: accepted
date: 2026-11-02
read_if:
  - changing seats, who may resolve a bargain card, pause or call-wave rights, or drop and rejoin behaviour
refs:
  - src/net/lockstep.ts
  - src/client/shell/lobbystate.ts
---

# D-GLNUBJD3Y4RUIGNS Co-op rules: one hero per human, fixed seats, drop hands the hero to a bot, owner-only hero cards

## Context
Wave 10 needed product answers before the netcode could fix ownership. B answered the design questions on 2026-11-02 and the lead took the link-based lobby.

## Decision
Each human drives exactly one hero and bots fill the rest. Slots are picked first come in the lobby and seats are fixed for the game. A dropped player's hero goes to a bot; a host drop ends the game. Hero-bound bargain cards are decided by their owner only; team cards, Decline and the cards of bot-driven heroes by any human, first command wins, and the bots-pick toggle is hidden in co-op. Anyone may pause, resume or call the next wave, with a callout naming who. The lobby is a shared link, `#room=`.

## Why
One hero per human is the simplest ownership model and keeps negotiation between heroes (pillar 1). Duplicate kits would need a lineup change. Letting any human resolve a bot hero's card keeps the game moving without a host-only choke point. Rejected: the host assigning slots, humans splitting heroes, a pause limit, mid-game takeover of bot heroes (intents and pings already direct bots), and ready-up for wave calls (UI cost).

## Consequences
Rejoin into the same seat is a stretch left in the backlog. The host maps peers to slot players and enforces ownership; the sim enforces only the hero-bound card rule (D-VXJDVX4RFRWSLUQB). Wave-master as a human seat is deferred.
