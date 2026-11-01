# Design

## Problem
B wants to watch bots play a full game on the Pages debug viewer as early as possible. Old waves 2 (perception), 3 (bots + intents) and 4 (Director) mostly share shapes, not code, so they merge into this one wave with a contract step, like wave 1. The reporter becomes wave 3. Must keep §6.1 determinism and D-4E4QRJ7N6LIGZDSD (no gameplay tests), and must not block lockstep (wave 10).

## Approach
1. **w2-contracts** (one agent, two commits: sim side, then bot side) fixes every shape below with working stubs.
2. Six parallel slices in worktrees, disjoint files: perception, intents, gunner-bot, standin-bots, director, viewer.
3. Lead integration: merge, `npm run golden`, watch on Pages, tune numbers, wave report.

### Bots run outside the sim step: `src/match/` (pure)
`Match` owns the `Sim`, perception cache, bot seats and director seat. `Match.step()`:
1. `sim.step()` (tick T);
2. fold T's events into `PerceptionMemory` (every tick);
3. on think ticks (`T % thinkEvery == 0`) compute perception once; each seat thinks;
4. seat commands go to `sim.command(seat.player, cmd, T + seat.reactionTicks)`;
5. return sim events plus `choice` events (tick T).

Why outside: "bots only issue commands" is structural (layering test); the command log alone replays a game on a bare `Sim`, so bot tweaks don't invalidate replays; lockstep needs no sim change (in wave 10 a seat's owner peer runs it and sends its commands like a human; all-peers-run-all-bots stays possible because `Match` is pure). Bot state is not in the state hash; it is a function of seed + config + sim history and covered by the Match determinism test.

Seats: players 0–3 = lineup slots 0–3, player 4 = wave master. RNG streams `deriveRng(seed, 'bot:<slot>')`, `deriveRng(seed, 'director')`; the sim rng is never read.

### Reaction delay (specced, tested)
A command decided from state after tick T is scheduled for T + d, `d = max(1, ticks(reactionSeconds))`; a seat never reads state newer than T for that decision. Per-seat `d` is the difficulty dial; the net layer may raise the floor to the input delay. Think cadence (`thinkSeconds`) is separate. Seats remember their pending commands and dedupe against them.

### Perception
Pure `perceive(sim, memory) → Perception` in `src/perception`, run only inside `Match`, at most once per tick, on think ticks; memoised by tick and exposed as `match.perception` (the viewer reads it). Temporal features live in `PerceptionMemory`, folded from events every tick, so lazy computation can't change results. Perception returns copied plain data, never sim objects (`Readonly<Entity>` is shallow). Hero bots see what a player sees: entities, statuses, resources, wave and next-wave preview, intents board; never the sim rng or the master's queue. The director additionally sees its budget and queue.

Shape: `tick`; `heroes[]` (id, slot, pos, hp fraction, threat, resource bands, cooldown readiness, statuses, `lineAllies`); `enemies[]` (lane progress, target); `clumps[]` (sweep enemies by descending lane progress then id, attach to the first clump whose centroid is within R); `comboWindows[]` (status zone, count, until); `ancient`; `wave`; `intents[]`; team aggregates.

### Utility framework and doctrines
`bots/utility.ts` `decide(decision, weights, rng, prevPick)`: options in fixed order `{id, value, cost, commands}`, score `value − cost`, plus a `stickiness` bonus for the previous pick, optional `doctrine.noise × nextFloat(botRng)`, ties to the first option, scores finite with −0 normalised (L-BUDC4M5PFNLU2NTN). Kit brains `{init(seat) → M, think(BotCtx, M) → Decision[]}`, `BotCtx = {p, self, doctrine, weights, rng, tick}`, dispatched on `def.kit`.

Doctrines are data in `content/bots.ts`, passed to `Match` so the reporter can compare them: `Doctrine {id, aggression, risk, leash, ultimate: 'free'|'spike'|'combo', noise, stickiness, weights?}` (weight keys like `gunner.redline.allyInLine`); `Seat {slot, doctrine, reactionSeconds}`; `BotSetup {thinkSeconds, seats, doctrines, kitWeights}`. Presets "hold-the-line" and "greedy". Leash is measured from the seat's post (default `heroSpawns[slot]`).

### Events (added to §6.6)
- `choice {hero, decision, options: [{id, score}], picked}`: emitted by `Match` when a decision with ≥ 2 options is first evaluated and whenever its pick changes (time-weighted, small logs).
- `intent {id, op, by, kind}`, `op: post | reserve | fire | fulfil | expire | cancel`: emitted by the sim.

### Intents board lives in the sim (hashed)
A human's armed trigger and a bot intent are the same object and must fire on the lockstep tick, so the board is sim state; logic in `intents/board.ts`, called by the sim in a new **intents** phase right after commands. Command `intent`: `{op: 'post', hero, slot, kind, x, y, fireIn}`, `{op: 'reserve', hero, intent, slot, offset}`, `{op: 'cancel', hero, intent}`.
- post: `fireTick = applyTick + fireIn`; one live posted intent per hero.
- At fireTick the sim casts the poster's slot at (x, y): success → `fire`, failure (dead, cooldown, locked) → `expire`.
- A reservation is an armed follow-up: at `fireTick + offset` the sim casts the reserver's slot at the intent point: success → `fulfil` (by reserver), failure or intent never fired → `expire` (by reserver). Accepted only before fireTick, one per hero per intent, offset ≤ `intents.maxOffsetSeconds`. No ability lock: casting it early just makes the reservation expire.
- Poster cancels before fireTick; a reserver cancels its own reservation. The intent is removed after its last reservation resolves.
- Cast success is observed from `ability` events for that hero and slot, so kit files stay untouched.

### Wave master in the sim, Director outside
Sim (`sim/master.ts`, hashed): when `game.master` is set, the wave schedule supplies only the clock and wave count. Each wave grants budget (unspent carries over); `summon {def, count}` spends it into the pending wave (over budget → logged no-op); `send {}` starts the pending wave early within `[minInterval, interval]`. The wave composition is the pending queue, so D-FZ2FXOOFFRB5P2YL wave-end semantics are unchanged. Schedule mode stays (existing golden, viewer toggle).

Director (`src/director`), seat 4, own reaction delay: a tension accumulator from perception (team damage, low-hp heroes, leaks) that decays; phases build → peak → relax (buy cards / send / hold and save); thresholds and spend mix are doctrine data. It paces for tension and never plays to win (Opponent is later).

### Viewer
All-bot `Match` with the Director on by default, so a full game plays on load; still no human commands. Controls: seed, director or schedule, doctrine per seat, reaction delay, think cadence (changes reset; config in the URL hash). Overlays: bot move targets, posts and leash circles; threat rings; clumps; combo windows; intents (marker, countdown, reserver lines, state colour); the Gunner's overpen line, red when an ally is in it. Bot panel: each decision's current pick, option score bars, time since last change. Director panel: tension and phase with sparkline, budget, pending composition, time to next send. Event log filters for `cmd`, `choice`, `intent`.

### Tests (D-4E4QRJ7N6LIGZDSD: invariants and specced engine behaviour only)
Match determinism: identical full event stream (including `choice`) for the same seed and config; the extracted command log replayed on a bare `Sim` gives an identical hash sequence; a Match golden in Node and browsers. Purity scan covers `perception`, `bots`, `intents`, `director`, `match` and requires them non-empty. Layering: `bots` and `director` import from `sim` only `commands.ts` and `events.ts`, as types. Reaction-delay scheduling with a probe brain. Intents lifecycle. Choice schema and emit-on-change. New command shapes; reflective hash test for board and master state. No test asserts what a bot or the Director chooses.

### Slices
| Step | Slice | Owned files | Exit check |
|---|---|---|---|
| 1 | w2-contracts | `sim/{events,commands,sim,context,hash,waves}.ts` (waves: master hook only); `content/{index,types,bots,intents,director}.ts`; stubs `intents/board.ts`, `sim/master.ts`, `director/*.ts`, `bots/{gunner,standins}.ts`; basic working `perception/{types,perceive,memory}.ts`; full `bots/{types,utility,brains}.ts`, `match/match.ts`; `test/purity-scan.ts`, `test/purity.test.ts`, `test/layering.test.ts`, `test/match/*`, `test/determinism/*` | ci green; a probe all-bot game runs to `end` in Node; reaction-delay, choice-schema, command-shape, hash and Match-replay tests pass |
| 2 | perception | `perception/{perceive,memory,clumps,threat,combos}.ts`, `content/perception.ts` | ci green; clumps cover each enemy exactly once in specced order; `lineAllies` filled |
| 2 | intents | `intents/board.ts` | ci green; lifecycle tests incl. limits and op order within a tick |
| 2 | gunner-bot | `bots/gunner.ts`, `content/bots/gunner.ts` | ci green; choices for stance, fire/hold with ally-in-line cost, vent, Suppressing Fire, Furnace Heart; reserves against a pull intent; watched in viewer |
| 2 | standin-bots | `bots/standins.ts`, `content/bots/standins.ts` | ci green; support posts pull intents, tank costs standing in the Gunner's line, ranged marks; watched in viewer |
| 2 | director | `sim/master.ts`, `director/{director,tension}.ts`, `content/director.ts` | ci green; summon/send shape and budget-refusal tests; master state hashed; a Director game reaches `end` |
| 2 | viewer | `client/*`, `test/client/*` | ci green incl. browser test; runs an all-bot Match |
| 3 | lead | merges, golden, tuning, Pages, wave report | B can watch a full bot game on Pages |

## Alternatives considered
- Bots inside the sim step: trivial lockstep, but bot state must be hashed, every bot tweak invalidates replays, and "commands only" is discipline. Rejected.
- `choice` as a no-op command: bloats the lockstep wire. Rejected; choices are Match annotations.
- Intents outside the sim: a human's armed trigger couldn't fire on the lockstep tick (§6.3). Rejected.
- Reaction delay as a stale view (decide at T on state T−d, apply at T+1): fights the lockstep input delay. Rejected.
- Perception every tick: wasteful for reporter batches; think ticks plus per-tick memory instead.
- Sequential old waves 2–4: about 3× wall-clock for no gain.

## Risks & open questions
- Bots look poor at first merge (built against stubs); step 3 is a watch-and-tune pass.
- Contract slice is the largest; committed in two halves.
- Every bot/Director tweak needs `npm run golden` (accepted).
- Decision flapping: stickiness, visible in the bot panel.
- Perception cost in deep batches: clustering is O(n²) over ~100 enemies; measure in step 3.
- Armed reservations are a second cast path in the sim; command-originated and deterministic; documented in `board.ts`.
- **Lead defaults, accepted by B (2026-11-01):**
  1. Wave master: whole roster available (types unlock by wave), no random hand; budget per wave carries over; `send` early within a window.
  2. Game length with the Director: the content's fixed wave count with victory, so games end; endless escalation is a config option later.
  3. Reservations auto-cast the follower's ability, for humans too; no lock.
  4. The Director paces for tension, never plays to win.
