---
status: accepted
date: 2026-11-02
read_if:
  - changing who drives a hero or who resolves bargains, adding Match-level state, or enforcing who may accept a card
refs:
  - src/sim/commands.ts
  - src/sim/bargains.ts
  - src/match/match.ts
---

# D-VXJDVX4RFRWSLUQB Control commands and bargain ownership live in the command stream

## Context
Who drives a hero slot and who resolves bargains were Match state changed directly by the shell (setDriven, setBargainPolicy). Peers that change them at different ticks diverge, and a replay of the command log cannot reproduce them. The sim also let any player accept any bargain card.

## Decision
Match-level state changes ride the command stream as control commands (drive a slot by human or bot, set the bargain policy), issued as SYSTEM_PLAYER. The sim validates and logs them and does nothing else; Match.step applies them from the step's cmd events and ignores them from any other player. Separately, the sim enforces that accepting a hero-bound bargain card requires player = that hero's lineup slot; team cards and Decline stay open to every player.

## Why
A control command is sealed like any input, so every peer and every replay changes driver or policy at the same tick, with no host-run bots. For bargain cards of bot-driven heroes the sim cannot know who drives, so the rule is the simplest deterministic one: the player must be the slot, with no exception. Whoever resolves a bot hero's card (a bot seat, or a human via the host) submits as that slot's player. Rejected: allowing any player for bot heroes (the sim would need driver state), and a host-only check (a replay would not reproduce it).

## Consequences
The host maps a human peer to the slot player when it relays an accept of a bot hero's card, and rejects accepts of other heroes' cards from a human who does not own them. Match submits bot accepts as the card hero's slot. The shell still calls setDriven and setBargainPolicy directly in solo play; moving it onto control commands is slice E2. Hand-built fixtures that accept a hero card as the wrong player now see a no-op.
