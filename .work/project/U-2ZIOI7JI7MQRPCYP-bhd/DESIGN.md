# BHD — Bjorn's Hero Defense · Project-lead handoff

You are the project lead for BHD. You run in a Claude Code CLI harness, own the plan below, delegate slices to subagents, and keep B (the owner and designer) in the loop on design decisions. This document is your starting brief. Keep it current: when a decision changes, update this file and record it with dev-proc (`record decision`, under `.work/decisions/`).

---

## 1. The game in one paragraph

A Warcraft 3–style hero defense. Four heroes hold a lane against escalating waves of enemies marching on the Ancient (the base). Solo, one player controls all four heroes, with bots running whatever the player isn't driving. Co-op supports 1–4 human hero players. An optional fifth player is the **wave master** and controls the enemy side. Setting: grimdark science-fantasy, where bows, autocannons and sorcery coexist and every kind of power has a price.

## 2. Design pillars (non-negotiable; judge every feature against them)

1. **Everything is a trade-off.** A real trade-off is one where the right answer changes with the situation. A cost the player always pays is a _tax_, not a trade-off. Rules of thumb:
   - Put the cost on a different axis from the gain (damage paid for with mobility, ally safety, or the Ancient's health — not with damage).
   - Let some costs land on teammates; in co-op this turns trade-offs into negotiations.
   - Make costs visible before commitment (heat, warp, next-wave preview).
   - Declining a bargain must be a valid strategy.
   - Exempt basic movement, selection and reading the battlefield. Those stay frictionless.
2. **Payoffs matter.** Two tiers of combos, both strategic and in the moment:
   - **Routine combos:** short statuses (2–4 s) applied by basic kits. Each hero sets up for someone and cashes in someone else. Statuses form a loop, not a chain.
   - **Wombo combos:** long-cooldown ultimates (60–120 s) that open or cash in big windows (~1–1.5 s timing). Combined effects multiply, not add. Every ultimate leaves an aftermath (a weak period), so wasting it is punished.
   - Ultimate charge may fill faster from routine combos (small payoffs feed big ones).
   - Every payoff must be legible: callout, hitstop, sound sting, clear status icons.

## 3. Locked decisions

| Area                      | Decision                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering | WebGL2, instanced quads with SDF shapes. |
| Simulation                | Fixed 30 Hz tick, fully deterministic, seeded RNG, pure (no DOM, no wall clock). Runs identically in browser and Node.                                                                                                    |
| Player actions            | Every action from humans _and_ bots goes through one `command()` interface. No other path mutates game state.                                                                                                             |
| Multiplayer               | Peer-to-peer WebRTC data channels, **lockstep with inputs only** (~100 ms input delay is acceptable for this genre).                                                                                                      |
| Signaling / lobby         | Small Cloudflare Worker + Durable Object (~100–150 lines).                                                                                                                                                                |
| NAT fallback              | Cloudflare TURN service.                                                                                                                                                                                                  |
| Future option             | Moving authority into a Durable Object later must be a transport swap, not a rewrite. Keep transport behind an interface. Only do this if desyncs or host drops become real problems.                                     |
| Bots                      | One brain, many jobs: unselected heroes in solo, empty co-op slots, heroes vs a human wave master, the wave master itself, and the reporter's self-play. Bots emit commands only and see only player-visible information. |
| Ability layout (end goal) | Each hero: 3 standard abilities + 1 ultimate, every ability with an autocast toggle (bots handle anything set to auto).                                                                                                   |
| Testing philosophy        | Not pass/fail balance tests. A **diff reporter**: "what changed, and how much?" between two builds. Determinism tests _are_ pass/fail.                                                                                    |

### Defaults you may revisit with B (not yet confirmed)

- **Language (confirmed by B, 2026-11-01):** TypeScript 7 (strict), ES modules; lit-html for UI widgets. Vite for the client, Vitest for tests, Node runs `.ts` CLIs directly (type stripping). Biome + knip for lint. Single package with `src/` folders, not a monorepo, until it hurts. Toolchain mirrors `skelly/deadvox`.
- **Friendly fire scope:** open question (see §10). Until decided, implement friendly fire as a per-damage-source flag, enabled only for the Gunner's overpenetration.

## 4. Heroes

Only the Gunner is fully designed. **Do not invent full kits for the other heroes.** Draft proposals and get B's sign-off before implementing them. Each hero's identity comes from a unique _resource_ that creates its own decision, not from stats.

| Hero                 | Resource          | Sketch (status: concept only, except Gunner)                                                                                                                                 |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gunner**           | Heat              | Designed — see §4.1                                                                                                                                                          |
| Huntress (bow)       | Stillness         | Charged shots while still; marks targets for ally bonus damage; arrows stay in the ground and must be walked over to recover ammo.                                           |
| Psyker (sorcery)     | Corruption / warp | Spells build warp; high warp = stronger spells + rising chance of a backlash that hurts allies or opens an enemy-spawning rift. Has a pull.                                  |
| Penitent (tank)      | Pain              | Stronger the more hurt he is; can't be healed normally. Ultimate _Martyrdom_ (concept): taunt all nearby, convert damage taken — including friendly fire — into stored Pain. |
| Chirurgeon (support) | Corpses           | Heals by harvesting fallen enemies, so the healer must be where the fighting is.                                                                                             |

### 4.1 Gunner — "The Furnace" (designed; numbers are starting values, not sacred)

Identity: she gets more dangerous the longer she commits; commitment is what's traded.

- **Spin-up (passive):** fire rate ramps from 40% to 160% over ~3 s of continuous fire. Moving drains spin over ~1 s (not instantly), so small adjustments are cheap and repositioning costs the ramp.
- **Heat (passive):** builds while firing.
  - Above 60% heat: rounds pierce armour.
  - Above 85%: rounds overpenetrate and hit everything in a line, **allies included**.
  - At 100%: overheat — 4 s vent, no fire.
  - Riding the redline is the skill. Armoured waves push her hotter; hotter endangers her own tank.
- **Brace (stance toggle):** braced = +30% range, spin never decays, rooted, fixed 90° arc. Unbracing takes 1 s. Doubles as the solo autopilot setting.
- **Vent (ability):** dump all current heat as a fire cone; damage scales with heat; resets spin to zero.
- **Suppressing Fire (third standard ability, provisional; B 2026-11-01, revisit later):** wide, low-damage cone that applies **Suppressed** (slow).
- **Furnace Heart (ultimate):** 6 s of no overheat and full overpenetration, followed by a forced 6 s vent.
- **Weaknesses:** flat armour (until hot), divers flanking a braced Gunner, anything forcing her to move.
- **Interactions:** Psyker pull → clean payoff into her cone. Penitent in front of her → overpenetration problem (negotiation). Huntress marks are consumed by first hit → she wastes them unless coordinated (deliberate anti-synergy). **Wombo:** Psyker pull + Penitent _Martyrdom_ + Gunner _Furnace Heart_ turns her worst anti-synergy into the best combo for 6 s.
- **Bargain examples:** heat never decays but +50% damage; Brace is permanent; no armour pierce but no friendly fire.

## 5. Enemies (initial roster for M1; extend later)

Every enemy type should ask the team a question and, ideally, counter one hero. The wave master's "cards" are these types.

| Type                                                                | Role           | Question it asks                                                                                                                                                  |
| ------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner                                                              | fast, fragile  | Can you cover the lane?                                                                                                                                           |
| Grunt                                                               | baseline       | —                                                                                                                                                                 |
| Brute                                                               | armoured, slow | Punishes cold Gunner fire                                                                                                                                         |
| Boss                                                                | every 5th wave | Do you have a wombo ready?                                                                                                                                        |
| _Later:_ swarm, nullifier, corpse-eater, diver, cleanser, scatterer | counters       | Swarms punish Huntress; nullifiers silence Psyker; corpse-eaters starve Chirurgeon; divers hunt fragile heroes; cleansers strip statuses; scatterers break pulls. |

## 6. Architecture

```
bhd/
  src/
    sim/          pure deterministic simulation: entities, map, combat, statuses, abilities, waves, command(), event emission
    detmath/      deterministic math + seeded RNG (see §6.1)
    content/      data: heroes, enemies, statuses, waves (TS or JSON, typed)
    perception/   per-tick derived view: threat, clumps, statuses, combo windows, resources
    bots/         utility AI framework, hero bots, doctrines (weight presets)
    intents/      shared intents board (bot intents == human armed triggers == pings)
    director/     wave-master bots: Director (pacing) now, Opponent (competitive) later
    reporter/     headless runner, worker pool, event log store, metrics, paired diff, HTML report
    replay/       replay viewer (reuses client renderer)
    client/       WebGL2 renderer, interpolation, HUD, input → commands
    net/          transport interface; WebRTC lockstep; signaling client
  worker/         Cloudflare Worker + Durable Object for signaling/lobby
  docs/           METRICS.md, EVENTS.md (decisions live in .work/decisions/)
```

### 6.1 Determinism rules (pass/fail; enforced by tests)

- Sim advances in integer ticks. No `Date`, `performance.now`, or `Math.random` inside `sim/`, `perception/`, `bots/`, `intents/`, `director/`.
- **Do not use `Math.sin/cos/tan/atan2/exp/log/pow/hypot` in sim code.** Their results are not guaranteed identical across JS engines, which breaks lockstep. Provide `detmath` implementations (polynomial or table-based). Basic arithmetic and `Math.sqrt` are IEEE-exact and allowed.
- Entity IDs are monotonic integers. Whenever iteration order affects outcomes, iterate in ID order.
- Bots and the director draw randomness only from their own seeded RNG streams, derived from the game seed.
- A state hash is computed every N ticks. Test: same seed + same commands → identical hash sequence, in Node and in a browser.
- Add a lint rule or a grep check in CI for the banned APIs in those folders.

### 6.2 Bots

- **Perception layer** computed once per tick, read by all bots (and later the HUD/pings): threat per hero, enemy clumps (deterministic clustering), active statuses, open combo windows, every hero's resource state.
- **Utility scoring:** every candidate action gets `expected value − cost`. Costs are explicit (e.g. Gunner redline score includes "ally in overpenetration line"). This is how bots respect pillar 1.
- **Doctrines:** a few weights per hero — aggression, risk tolerance, leash distance, ultimate policy (use freely / save for spike / follow combos only). Presets ("Hold the line", "Greedy") are named weight sets in data.
- **Reaction delay** parameter = difficulty dial.
- **Decision records:** whenever a bot picks between trade-off options, it emits a `choice` event with the options and scores. The reporter needs these.

### 6.3 Intents board

- A hero about to set up posts an intent: `{kind, by, at:{x,y}, fireTick, expiresTick}`. Others may reserve a payoff ability against it; fulfilment or expiry is logged.
- A human's armed trigger and a bot's intent are **the same object**. Solo: arm one hero's ultimate and the bots on the other three follow up. Co-op: a ping becomes an intent bots respect. Over the network, triggers fire on the host/lockstep tick, which hides latency.

### 6.4 Wave master

- **Director** (M1): budget-based spawning shaped by a tension curve (Left 4 Dead–style pacing), reads perception of the team.
- **Opponent** (later): reads the team's draft, counters compositions, baits ultimates, then spikes.
- Humans and bots use the same command set: spend budget on a hand of unit cards, choose timing.

### 6.5 Reporter (the M1 deliverable)

Purpose: after any change, show **what moved, by how much, and whether it was expected**.

- **Paired runs:** baseline A vs candidate B on the same seeds, compositions and doctrines. Report per-metric paired differences with bootstrap 95% confidence intervals.
- **Two speeds:** quick batch (~100 games) on demand during iteration; deep batch (thousands) for decisions. Headless, multi-worker, far faster than real time.
- **Event log first:** store each game's event stream (compact NDJSON or binary, compressed). Metrics are queries over stored logs, so new metrics can run over old games. Every log is also a replay.
- **Report content:**
  - Biggest movers first, ranked by effect size; hide anything inside the noise floor.
  - **Change tags:** each run declares what it touched (e.g. `gunner.heat`). Metrics that moved _outside_ the tagged area are flagged separately — this is the emergent part.
  - Distributions (small histograms), not just means; a change can keep the mean and widen the spread.
  - **Choice spread** per trade-off decision from `choice` events. A side drifting toward 100% means the trade-off is becoming a tax.
  - For each big mover, a link to the paired seed where A and B diverged most, opened at the divergence tick in the replay viewer.
- **Later (not M1):** an "adapted" column where a quick search re-tunes doctrine weights on build B, separating "effect with today's play" from "effect once players figure it out".
- **CLI shape (target):** `bhd report --base <git-ref|config> --cand <git-ref|config> --tag gunner.heat --games 100` → writes an HTML report and prints a summary table.

Example summary:
```
Gunner: overpen threshold 85% → 80%    (2,000 paired games)
Δ avg wave reached     +0.4  ±0.2
Δ Penitent FF taken    +31%  ±6%   ← outside change
Δ redline time         +12%  ±3%
Δ Martyrdom combo rate  +8%  ±4%   ← outside change
choice: brace vs mobile  71/29 → 78/22
```

### 6.6 Initial event schema (refine in `docs/EVENTS.md`)

Every event: `{tick, kind, ...}`.

| kind       | fields                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| `cmd`      | `player, cmd` (the exact command)                                         |
| `wave`     | `n, phase: start                                                          | end, composition` |
| `spawn`    | `id, type`                                                                |
| `dmg`      | `src, dst, amount, tags: [ff, overpen, pierce, splash, ability:<id>]`     |
| `status`   | `dst, status, on                                                          | off, src`         |
| `ability`  | `hero, slot, target, value` (value filled when known)                     |
| `resource` | `hero, resource, band` (emit on band crossings only, e.g. heat 60/85/100) |
| `combo`    | `name, members, value`                                                    |
| `intent`   | `id, op: post                                                             | reserve           | fulfil | expire, by, kind` |
| `choice`   | `hero, decision, options:[{id, score}], picked`                           |
| `death`    | `id, killer`                                                              |
| `leak`     | `id, livesLost`                                                           |
| `hash`     | `stateHash` (every N ticks)                                               |

### 6.7 First metrics (day one)

1. Average wave reached, with distribution
2. Leaks per wave
3. Ancient health curve
4. Hero deaths per hero
5. Damage share per hero
6. Friendly-fire damage dealt and taken, per hero pair
7. Time spent in each heat band (Gunner)
8. Ability casts and average value per cast
9. Combo rate per combo type, and average payoff
10. Intent fulfilment rate and post→fulfil latency
11. Choice spread per decision (e.g. brace vs mobile)
12. Tension curve: lowest team health per wave
13. Ultimate timing: wave and situation when ultimates are used

## 7. Milestones and slice waves

Work in **waves**: every slice in a wave can run in parallel (one subagent each); a wave starts only when the previous wave's exit check passes. Keep slices small enough to review in one sitting.

### Milestone 1 — Framework → reporter

**Exit criteria:** `bhd report` compares two builds of the Gunner and produces a readable diff report; determinism verified in Node and browser; a tweak to Gunner heat produces visible, explainable movement, including at least one flagged outside-the-change effect.

**Wave 0 — Foundations**
- 0a. Repo scaffold: TypeScript, Vite, Vitest, lint, CI script, folder layout from §6.
- 0b. `detmath`: seeded RNG with derivable streams; deterministic trig/atan2/hypot; tests against reference values.
- 0c. Sim core: tick loop, entity store with monotonic IDs, `command()` entry point, event emitter, state hash.
- 0d. Determinism harness: run seed twice → identical hash sequence; banned-API check for sim folders.

**Wave 1 — Content and combat**
- 1a. Lane map (waypoint path, base), enemy roster from §5, wave spawning by schedule.
- 1b. Combat core: damage pipeline with tags, armour, friendly-fire flag, statuses system (Suppressed, Marked, Exposed, Clumped as first set).
- 1c. Gunner full kit from §4.1, including Furnace Heart; third ability stubbed behind a flag pending B.
- 1d. **Stand-in heroes:** three simple parameterised heroes (tank, ranged, support) so a 4-hero team exists. Clearly marked as placeholders; no invented resources.

**Wave 2 — Perception**
- 2a. Perception layer from §6.2 with deterministic clustering.
- 2b. Snapshot tests on fixed scenarios (golden outputs).

**Wave 3 — Bots and intents**
- 3a. Utility framework: considerations, scoring, explicit costs, doctrine weights from data, reaction delay, `choice` event emission.
- 3b. Gunner bot (fire/hold, brace/unbrace, vent timing, redline risk with ally-in-line cost, Furnace Heart policy).
- 3c. Stand-in hero bots.
- 3d. Intents board: post/reserve/fulfil/expire, logged; Gunner reserves Furnace Heart against a stand-in "pull" intent to prove the loop.

**Wave 4 — Wave master**
- 4a. Director bot: budget, tension curve, unit-card hand, reads perception.

**Wave 5 — Reporter**
- 5a. Headless runner + worker pool; scenario config (compositions, doctrines, seed list).
- 5b. Event log storage and loader.
- 5c. Metrics registry (queries over logs) with the §6.7 set; `docs/METRICS.md`.
- 5d. Paired diff with bootstrap CIs, effect-size ranking, noise floor, change tags, outside-the-change flags, choice spread, distributions.
- 5e. HTML report + CLI summary; quick vs deep batch modes.
- 5f. Minimal replay viewer (WebGL renderer reading event logs) with divergence-tick links from the report.

### Milestone 2 — Something playable

**Exit criteria:** solo play on desktop and mobile with four heroes (player drives any, bots drive the rest); then 2–4 player co-op over the internet via WebRTC lockstep; a human can play wave master against bot heroes.

**Wave 6 — Design checkpoint (with B, before code)**
- 6a. Bring B proposals for Penitent and Psyker kits (needed for the _Martyrdom_ wombo), the Gunner's third ability, and the friendly-fire scope. Implement nothing until signed off.

**Wave 7 — Client shell**
- 7a. Renderer: WebGL2 instanced SDF renderer; interpolate between sim ticks; camera fit for portrait and landscape.
- 7b. Input → commands: select (tap/1–4), move, abilities (Q/W/E/R or on-screen buttons), autocast toggles.
- 7c. HUD: hero cards, resources (heat bar), cooldowns, status icons, wave preview.
- 7d. Arming triggers UI (creates intents).

**Wave 8 — Solo playable**
- 8a. Solo loop: player-selected hero is manual, others bot-driven per autocast settings.
- 8b. Implement signed-off Penitent and Psyker kits + bots; Martyrdom wombo end to end.
- 8c. Payoff feedback: combo callouts, hitstop, status visuals, sound stings (audio starts after first interaction).
- 8d. Reporter run across the new heroes; review movers with B.

**Wave 9 — Between waves**
- 9a. Bargain system (relics with drawbacks, spend Ancient health for power), with "decline" always available; scars on hero death. Small initial pool.

**Wave 10 — Multiplayer**
- 10a. Signaling Worker + Durable Object (rooms, join codes).
- 10b. WebRTC peer setup; transport interface; TURN fallback.
- 10c. Lockstep: input delay, tick confirmation, stall handling, state-hash desync detection with a dump for debugging.
- 10d. Hero ownership per player; bots fill empty slots.

**Wave 11 — Human wave master**
- 11a. Wave master UI: budget, card hand, timing; plays against bot or human heroes.

## 8. How to work

- **Small slices, always runnable.** Each slice ends green: tests pass, determinism check passes, and (once Wave 5 lands) a quick reporter run if the slice touches gameplay.
- **Delegate per slice.** Give each subagent: the slice, the relevant sections of this doc, the files it owns, and its exit check. Review before merging. Never let two subagents own the same file in one wave.
- **Design questions go to B.** Numbers can be tuned freely; mechanics, new resources, new heroes and pillar-level choices need B. Batch questions; don't block a wave on one if other slices can proceed.
- **Pillar check on every mechanic:** name one situation where each side of the choice is clearly better. If you can't, flag it as a tax.
- **Log decisions** as dev-proc decision records (`.work/decisions/`); state who decided in the record.
- **Report to B at the end of each wave:** what landed, what the reporter says moved (once available), open questions. Short.

## 9. Reference

- The early `last-ancient.html` prototype is dropped (B, 2026-11-01): it reflects little of the refined design. Build the renderer fresh.

## 10. Open questions for B

1. Friendly fire: core to the whole game, or only on specific heroes (Gunner, Psyker)?
2. ~~Gunner's third standard ability~~ Suppressing Fire for now, revisit later (2026-11-01).
3. ~~TypeScript strict as the language — OK?~~ Yes: TS 7 strict, lit-html for UI (2026-11-01).
4. Platform priority: mobile-first, desktop-first, or equal?
5. Art direction beyond "grimdark science-fantasy": reference points?
6. Ability slots in M2: ship full 3 + ult for implemented heroes, or a reduced kit first?
