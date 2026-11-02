---
status: accepted
date: 2026-11-02
read_if:
  - changing WireMsg, the lobby handshake, restart in co-op or join refusals
refs:
  - src/net/types.ts
  - src/client/shell/lobbystate.ts
---

# D-M66ROCKQNF4R3Y2T Co-op wire: the lobby message doubles as slot pick, refuse and end messages, PROTOCOL_VERSION 2

## Context
The step-1 wire had no slot-pick request, no way to tell a joiner why it was turned away, no peer names for the lobby, and no restart. The lobby slice worked around the first by reusing a message.

## Decision
A joiner's lobby message is its slot-pick request and the host reads only entries equal to the sender. A refuse message carries the reason (build, version, full, already started), and a parallel names list rides with the lobby. Restart is an end message from the host to all; a client asks the host to send it. Everyone returns to a fresh lobby over the same links, so signalling and room stay up, and a late hello during a game is refused as started. The protocol version was bumped to 2.

## Why
Reusing the lobby message avoided a fourth message kind for the same state. Keeping the links alive on restart avoids a reconnect and a new room code. Rejected: a dedicated pick message, and tearing the room down per game.

## Consequences
A refusal of a pick is local only. Any further change to the union must bump the version; mixed builds are refused by version before the fingerprint is even compared.
