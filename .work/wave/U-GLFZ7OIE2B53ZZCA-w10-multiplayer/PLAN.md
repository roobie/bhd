# Plan: wave 10 multiplayer (Opus plan, 2026-11-02)

## Summary
- **Nothing in networking exists yet.** `src/net/` and `worker/` each hold only a `.gitkeep`. Everything else lockstep needs is already in place: a deterministic Match (bots included) that is checked for cross-runtime equality, (player, seq) command order, `hash` events with `verifyHashes`, and the `CommandSink` seam.
- **Topology (recommended): star with the host as sequencer.**
  - Each peer sends its inputs to the host. The host seals each tick as `{tick, inputs[]}` and broadcasts it. A peer steps a tick only once it has that tick's seal.
  - The host's view is the canonical one, so a drop never needs a consensus round.
  - This also matches DESIGN §3's "a Durable Object authority later is a transport swap": the Durable Object would simply take over as sequencer.
  - Rejected alternative: a symmetric mesh. It has lower latency, but peers must agree on a dropped peer's last tick.
- **Bots are not sent over the wire.** Every peer runs the same Match, so bot commands come out identical everywhere. What must go through lockstep is the Match state that changes bot behaviour: who drives each slot, and `bargainPolicy`. Both become **control commands** on the normal `sim.command` path:
  - The sim treats them as no-ops but logs them as `cmd` events.
  - Match reacts to the `cmd` event right after the step, so every peer changes at the same tick, and replays reproduce the change.
  - This meets the wave-9 constraint ("peers with different policies diverge") without host-run bots.

## 1. Code facts

| Area | State | Ref |
|---|---|---|
| Net and signalling | Empty: only `.gitkeep` in each | `src/net/`, `worker/` |
| Sink | `localSink` calls `match.sim.command(player, cmd, tick+3)` **immediately** | `src/client/shell/sink.ts` |
| Input delay | `INPUT_DELAY_TICKS = 3`; the `CommandSink` doc already says "wave 10 replaces" | `src/client/shell/types.ts:239-244` |
| Frame loop | Steps by wall clock (`planFrame`). There is no tick gate, at most 5 steps per frame, and the surplus is dropped, so there is no catch-up | `shell/app.ts:317-327`, `shell/frame.ts` |
| Pause and restart | `controls.paused` and `restart()` are local only | `shell/controls.ts:269`, `app.ts:141` |
| Driven slots and policy | `match.setDriven` and `match.setBargainPolicy` are called directly from the shell, outside the sim | `app.ts:144,175,189`, `match.ts:311,345` |
| Command order | Sorted by (player, seq). seq is the **submission order on each peer**, so peers must submit in the same order | `sim.ts:191-213`, D-ZWZVLE5U4MRETLI7 |
| Ownership | None. `applyCommand(ctx, cmd)` does not receive the player. The comment in `commands.ts` says "No ownership checks until wave 10" | `sim/commands.ts:4,338` |
| Bargain resolution | `applyBargainCommand` takes the first valid accept or decline from any player. `OfferCard.hero` is 0 for a team card | `sim/bargains.ts:63-67,554` |
| Bot bargains | The lowest-slot bot seat decides **every** card for the team | `match.ts:484-490`, `bots/bargain.ts` header |
| Match bookkeeping | Bots submit at `T+delay` during step T. Handover sync commands go in at `T+1` as `player = slot` | `match.ts:376-392,540-555` |
| Seats | Players 0-3 are slots 0-3, player 4 is the Director, and player equals slot | `match.ts:14`, D-VJREQF3N6HSKMGXF |
| Lineup | Fixed: gunner, penitent, psyker, support standin. No duplicate heroes | `content/index.ts:69` |
| Hashing | A hash every 30 ticks. Pending commands are excluded (D-NZFIASEDRLJLBWAF). `verifyHashes` finds the first divergent checkpoint and can be reused | `sim.ts:227`, `replay/verify.ts` |
| Cross-runtime check | The scenario already runs a full Match with bots on Node, chromium, firefox and webkit | `test/determinism/scenario.ts:438` |
| Replay | Driven games do not replay, because the log does not carry the human input stream (B-E6AFQ5LENRZY2ANU) | `replay/log.ts` |
| Fingerprint | `fingerprint()` hashes the pure dirs but only runs in Node, so the client has no build fingerprint for a handshake (B-LALPYHJRLNJOODZD) | `reporter/sides.ts:54` |
| Tooling | Node ≥26 has no `RTCPeerConnection`. No wrangler or CF types are installed. Browser tests run on chromium, firefox and webkit | `package.json`, `vite.config.ts` |

## 2. Gaps against M2's criterion "2–4 player co-op over the internet via WebRTC lockstep"
1. Signalling: no Worker or Durable Object, no rooms or join codes, and no TURN credential endpoint.
2. Transport: no transport interface, no WebRTC data channels, and no STUN/TURN configuration.
3. Lockstep: no tick sealing or gating, no stall UI, and no catch-up. The input delay is local only.
4. **Seq-order hazard.** Inputs are pushed into the sim as they arrive. Two peers can therefore assign different seqs within one player for the same tick, and the game silently desyncs. See the R1 rule in Step 1.
5. Match-level state (driven slots, bargain policy, pause, restart) changes locally and does not go through lockstep.
6. Ownership: there is no peer-to-player mapping and no rule for hero-bound bargains. The Match bot decider can take a card that belongs to a human's hero.
7. Desync: peers do not exchange hashes, nothing halts on mismatch, and there is no dump. There is also no input log to replay a dump from.
8. Handshake: there is no version or fingerprint check between peers.
9. Lobby: no UI, and `ShellConfig` has no room parameter.
10. **"Over the internet" evidence needs the user** to deploy the Worker and set the TURN secret. Locally we can only reach LAN or loopback.

## 3. Design questions for B

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | How do human players and heroes split? | (a) Each human drives exactly one hero and bots fill the rest. (b) Humans split all four heroes, so two players take two each. (c) The host assigns any split. | **(a)**. It is the simplest model of ownership, and pillar 1 negotiation happens between heroes. |
| Q2 | How are heroes picked? The lineup is fixed, so there are no duplicates. | (a) In the lobby each player picks a free slot, first come. (b) The host assigns. (c) Random. | **(a)**. Duplicate kits would mean changing the lineup, so they are out of M2. |
| Q3 | What happens when a player drops? | (a) A bot takes over the hero at a tick the host announces, with no rejoin. (b) As (a), but the player can rejoin the same slot: they receive the spec plus the input log and fast-forward headless. (c) Everyone pauses until the player rejoins or a timeout. | **(a)** is the base, with **(b)** as a stretch goal this wave. In both, **a host drop ends the game** in M2; host migration comes later. |
| Q4 | Who resolves team cards and Decline, and the cards of bot-driven heroes? | (a) Any human, and the first command wins. (b) Host only. (c) A vote within the 20 s window. For a bot-driven hero's card: any human may accept it, or its bot decides. | **(a) any human**, the same rule the engine uses already. Any human may accept a bot hero's card. The "bots pick" toggle is hidden in co-op. |
| Q5 | Who may call the next wave early in co-op? | (a) Any human. (b) Host only. (c) Every human must ready up. | **(a)**, with a callout naming who called. (c) fits the negotiation pillar but costs UI. |
| Q6 | How does pausing work? | (a) Anyone pauses for everyone and anyone resumes, with a callout. (b) Host only. (c) No pause in co-op. (d) A limited number of pauses per player. | **(a)**. It costs nothing to sync, since stepping simply halts. |
| Q7 | What is the lobby flow? | (a) The host creates a room and shares a link `play.html#room=ABCD`. Joiners pick slots. The host picks mode and seed and starts. Restart sends everyone back to the lobby. (b) A code typed into a form only. (c) Matchmaking. | **(a)**. A greyed-out wave-master seat can be reserved for wave 11. |
| Q8 | Can a co-op player take over a bot hero mid-game, the way solo swapping works? | (a) No, seats are fixed. (b) Yes, any bot hero no one owns. | **(a)**. Intents and pings already let a player direct the bots. |

Lead decisions that do not need B: star topology with the host as sequencer, input delay D=3 ticks for the host (clients get D plus their one-way latency), and halt with a dump on desync.

## 4. Step 1: lead contract (one slice, about 1 day)
- **`src/net/types.ts`**
  - **Transport:** `send(peer, msg)`, `broadcast(msg)`, `onMessage(from, msg)`, `onPeer(up|down)`, `close()`.
  - **Signalling:** `join(room)`, `relay(to, sdp|ice)`, `onSignal`, `peers`.
  - **Wire protocol:** a discriminated union, per B-73XE3F5W6NBN5BMT:
    - `hello {abi, fingerprint, name}`
    - `lobby {slots, mode, seed}`
    - `start {spec, seats: peer→players[], delay}`
    - `input {player, cmd, wantTick}`
    - `seal {tick, inputs: {player, cmd}[]}`
    - `hash {tick, hash}`
    - `desync {tick}`
    - `pause`, `resume`, `drop {peer, atTick}`, `bye`, `ping`/`pong`
- **`TickDriver` replaces how the shell uses `CommandSink`** (in `shell/types.ts`):
  - `submit(player, cmd)`
  - `steppable(): number`, the highest tick that is safe to step
  - `beforeStep(tick)` and `afterStep(events)`
  - `status()`: running, stalled, paused, desynced or ended
  - `localDriver` gives exactly today's behaviour.
- **Rule R1 (determinism contract).** In networked mode nobody calls `sim.command` for a human or system player except `beforeStep(T)`. It submits tick T's sealed inputs in seal order: sorted by player, then by the order each player sent them. Match's own submissions for T always happen during earlier steps, so the order is identical on every peer. Write this into the `sim.command` docstring and record it as a decision.
- **Control commands.**
  - New `Command` kind: `{kind:'control', op:'drive', slot, by:'human'|'bot'}` or `{kind:'control', op:'bargainPolicy', policy}`.
  - Issued by `SYSTEM_PLAYER = 5`. The sim validates the shape, does nothing with it, and logs it.
  - `Match.step` scans the step's `cmd` events and applies `setDriven` or `setBargainPolicy`. It ignores control commands from any other player.
  - Update `isValidCommand`, `canonicalCommand`, `channelOf` and the determinism scenario, following the comment in `commands.ts`.
- **Bargain ownership in the sim (engine rule).**
  - `applyCommand(ctx, cmd, player)` passes `player` to `applyBargainCommand`.
  - Accepting a hero-bound card requires `player === slot(card.hero)`.
  - Team cards and Decline: any player, or whatever B answers to Q4.
  - Hero commands stay open in the sim, so test rigs that use player 0 keep working. The host enforces peer-to-player ownership.
- **Stubs** for every interface, so step 2 slices compile. Record the decisions: topology, R1, control commands, and bargain ownership.

## 4b. Step 2: parallel slices (Sonnet, one worktree each; each depends only on Step 1)

| Slice | Owns | Size | Content |
|---|---|---|---|
| **A: signalling** | `worker/**` (`room.ts` pure, `index.ts` CF adapter plus Durable Object, `wrangler.toml`, **never deployed**), `src/net/signal/{ws,broadcast,memory}.ts`, `test/net/room.test.ts` | M | Rooms with 4-letter codes, peer ids, host = first peer, relay of offers, answers and ICE, presence, and a `/turn` endpoint that mints Cloudflare TURN credentials from a secret the user sets. Lobby state itself travels over the data channels. `BroadcastChannel` signalling (`room=local-*`) lets two tabs test locally with no server. CF types are declared by hand, so no new dependencies. |
| **B: WebRTC transport** | `src/net/rtc.ts`, `test/net/rtc.browser.test.ts` | M | Star connections from host to each client over one ordered, reliable data channel each. ICE config with public STUN plus optional TURN. Connection-state changes map to `onPeer(down)`. The browser test runs two `RTCPeerConnection`s in one page over memory signalling, on chromium and firefox only, since headless webkit WebRTC is unreliable. |
| **C: lockstep core** | `src/net/lockstep.ts` (host sequencer plus client driver, pure, clock injected), `src/net/inputlog.ts` (record, `replayInputs(spec, seals)`, dump codec), `test/net/harness.ts` (loopback hub with a seeded latency/jitter/reorder model and a virtual clock), `test/net/lockstep.test.ts` | L | Covers: sealing at host tick+D, re-ticking a late input to the next open tick, the host validating peer-to-player ownership, stall and catch-up, pause and resume, a drop becoming a host-issued `control drive→bot`, a hash exchange every 30 ticks compared by the host, and halt plus dump on mismatch. |
| **D: Match seat and policy** | `src/match/match.ts`, `src/bots/bargain.ts`, `test/match/control.test.ts` | M | Match applies control commands from `cmd` events. The bot decider takes only cards for bot-driven heroes, plus team cards and Decline per Q4, and submits each accept as `player = slot(card.hero)`. It is the lowest bot seat whose hero is up. Engine-spec tests only: handover at the same tick on two Matches, and the ownership rejection. |
| **E1: lobby and config** | `src/client/shell/lobby.ts` (lit-html), `shell/config.ts` (`room` and `name` params), `play.html` (lobby root), `test/client/shell/lobby.browser.test.ts` | M | Create or join, slot picks, host start, fingerprint mismatch screen. |
| **E2: shell integration** | `shell/app.ts`, `sink.ts` (becomes the driver), `hud.ts`, `hudmodel.ts`, `bargains.ts`, `controls.ts`, `frame.ts` | L | The step loop runs while `tick < driver.steppable()`, with a larger step cap when behind. Panels for stalled, peer dropped and desync (with a download button). Pause and restart go through the driver. Solo takeover and the bargain toggle emit control commands, which also lets solo driven games replay. Heroes and cards owned by others are badged and not clickable. Works against `localDriver` alone until step 3. |

Notes:
- **Shared files.** `shell/types.ts`, `sim/commands.ts` and `test/determinism/scenario.ts` belong to the lead (Step 1). Slices ask the lead for changes to them.
- **knip.** Each slice adds its new entry points (`worker/index.ts`) to `knip.jsonc`; the lead merges these.
- **Agent briefs** must say: use Write/Edit, never heredocs, and give each agent its own CI log path (L-WBI36R65C4HCTCAE).

## 5. Step 3: integration (lead, then Opus review)
- **Wiring.** Add a `netDriver(transport, lockstep, match)` in `src/net/driver.ts`, and have `shell/main.ts` choose it when `room` is set. Put the build fingerprint into `vite.config.ts` with `define: {__BHD_FINGERPRINT__: fingerprint(root)}`, reusing `reporter/sides.ts`.
- **Headless N-peer harness (Node, the main proof).**
  - 2, 3 and 4 peers, each with its own Match and driver, over the loopback hub with seeded jitter and reordering. Inputs are delayed, never lost, since the channel is reliable.
  - Scripted humans plus controls: a drive handover, a policy toggle, a pause, and a drop that hands the hero to a bot.
  - Assert that every peer's hash sequence is equal, and equal to `replayInputs(spec, hostSeals)`. These are engine invariants, not gameplay pins.
  - Fault test: inject one stray `sim.command` into one peer. Detection must happen at the next hash tick, and the dump must replay to a first divergent checkpoint through `verifyHashes`.
- **Cross-runtime.** Add the control-command and replayed-seals segment to `test/determinism/scenario.ts`. The existing browser project then shows that chromium, firefox and webkit match Node for a networked-style input stream (D-V4TA7WE5J4QC24D3).
- **Real WebRTC.**
  - Slice B's in-page browser test.
  - Optionally, a Playwright script (`test/net/two-browsers.e2e.ts`, outside CI) that launches chromium and firefox pages against `vite dev`, signals through a roughly 40-line Node HTTP+SSE relay in the fixture, plays 900 ticks and compares hashes.
- **Manual local test.**
  - Run `npm run dev` and open `play.html#room=local-test` in two tabs (BroadcastChannel signalling). Try Chrome devtools throttling and switching tabs away to background them.
  - Optionally, run `wrangler dev` (only the user installs it) to test across browsers or across the LAN.
  - **Internet evidence needs the user to deploy the Worker and set the TURN secret.** Ask B to run a 2–4 player session for the M2 evidence.
- **Desync dump.**
  - An NDJSON file: a header (spec, fingerprint, peer, seats, delay), the sealed frames, and the local checkpoints.
  - A `bhd desync a.ndjson b.ndjson` subcommand (owned by C, in the reporter CLI) replays at `hashEvery=1`, prints the first divergent tick and diffs the hash sections.
  - Close B-E6AFQ5LENRZY2ANU and fold in B-LALPYHJRLNJOODZD for the fingerprint.

## 6. Risks
- **R1 violations.** Any direct `sim.command` for a networked player, including the local player's own input, desyncs silently until the next hash. Mitigations: the driver owns submission, plus a harness test with randomised arrival order.
- **Background tabs.** `requestAnimationFrame` stops entirely and timers drop to about 1 Hz. If the host's tab is hidden, everyone stalls. Mitigations: drive the host's sealing from a Web Worker timer; clients catch up quickly; show "host paused/backgrounded". iOS Safari suspends hidden pages, so expect that to look like a drop, which hands the hero to a bot.
- **Host is a single point of failure.** A host drop ends the game in M2.
- **Client input lag.** Clients feel D plus their one-way latency (about 150–200 ms) while the host feels 100 ms. That is acceptable for the genre (DESIGN §3); adaptive D comes later.
- **No TURN without the user's deploy.** Symmetric NATs fail until then, so local testing cannot prove the internet criterion.
- **Bot cross-runtime determinism** is now load-bearing for peers. The scenario already covers it, but any new bot code must stay pure (it is in `PURE_DIRS`).
- **Control commands touch the sim command union.** Step 1 must update the canonical, validation, channel and scenario code together. Hand-built fixtures may break (L-ZVJXTR56UAAXHAGT).
- **Version skew between peers.** The fingerprint check in the handshake is mandatory, and the user deploys pages and the Worker separately.
- **Headless webkit WebRTC** is flaky. Scope the real-WebRTC tests to chromium and firefox.
- **Shell file contention.** `app.ts` and `hud.ts` are large, and E2 has the most risk. Keep E1 off those files.

### Critical Files for Implementation
- /home/agent1/devel/bhd/src/match/match.ts
- /home/agent1/devel/bhd/src/client/shell/app.ts
- /home/agent1/devel/bhd/src/client/shell/types.ts
- /home/agent1/devel/bhd/src/sim/commands.ts
- /home/agent1/devel/bhd/src/sim/bargains.ts
