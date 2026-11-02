# BHD signalling worker

WebRTC signalling for multiplayer: rooms with 4-letter codes (max 5 peers, host = first to join),
relay of offer / answer / ICE, presence, and `/turn` (Cloudflare TURN credentials from the
`TURN_KEY_ID` and `TURN_KEY_TOKEN` secrets; STUN only without them).

- `room.ts` is the pure room state machine (also used by the in-memory test signalling).
- `index.ts` is the Worker fetch handler plus the `Rooms` Durable Object.

**This worker is never deployed by the agent.** The owner deploys it (`wrangler deploy` from this
directory) and sets the secrets. Local rooms named `local-*` need no worker (BroadcastChannel).
