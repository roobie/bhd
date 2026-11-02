# BHD signalling worker

WebRTC signalling for multiplayer: rooms with 4-letter codes (max 5 peers, host = first to join),
relay of offer / answer / ICE, presence, and ICE servers. Those come in the `joined` message a room
member receives (Cloudflare TURN credentials from the `TURN_KEY_ID` and `TURN_KEY_TOKEN` secrets;
STUN only without them); there is no public `/turn` endpoint.

`ALLOWED_ORIGINS` (a var, comma separated, e.g. `https://bhd.example`) limits `/new` and `/ws/*` to
those page origins. **When it is unset (or `*`) every origin is allowed**, which is fine for a hobby
deploy but lets any site use your room and TURN quota; set it for a real deployment.

- `room.ts` is the pure room state machine (also used by the in-memory test signalling).
- `index.ts` is the Worker fetch handler plus the `Rooms` Durable Object.

**This worker is never deployed by the agent.** The owner deploys it (`wrangler deploy` from this
directory) and sets the secrets. Local rooms named `local-*` need no worker (BroadcastChannel).
