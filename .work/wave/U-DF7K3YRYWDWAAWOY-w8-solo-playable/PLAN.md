# Plan: wave 8 solo playable

Drafted by an Opus planner from main 1bf0c9a. Lead rulings on its §3: Q3 Pavise blocks enemy hits too (G3 text, D-XVHJGA432FCOHEEU); Q4 hitstop is visual only (accepted); Q5 bots honour the autocast mask (accepted); B answered Q1 and Q2: basic attacks add Warp (+4 default) and the nova hits enemies only; both remain content knobs.

## 1. Steps and slices

Golden rule for the whole wave: **only the lead regenerates the golden, twice.** The first regen happens when step 1 is integrated, because the leash change, respawn and the lineup swap all move the hashes. The second happens once, at step 3. Step-2 slices may run `npm run golden` locally to get a green CI run, but must run `git checkout test/determinism/golden.ts` before every commit. Their CI logs go to per-agent paths.

### Step 1: engine prep and contracts (one slice, sequential, size L)

This step sets up every shared file so that step-2 slices only touch files they own. Engine details are in §2.

- **Sim files it changes:**
  - `src/sim/{context,combat,deaths,entities,query,commands,events,hash,movement,enemies,waves,sim}.ts`
  - `src/sim/heroes/index.ts`
  - New `src/sim/respawn.ts` and `src/sim/props.ts`.
- **New hero stubs (sim and content):**
  - `src/sim/heroes/{penitent,psyker}.ts`: the state types, plus init, tick, command and hash functions that do nothing yet.
  - `src/content/heroes/{penitent,psyker}.ts`: full defs with B's numbers.
  - Gunner content: slot 2 renamed from `suppress` to `pavise` (def only).
- **Lineup and rules:**
  - `src/content/index.ts`: HeroDef union, `GameConfig.rules`, `validateGame`. The lineup becomes 0 Gunner, 1 Penitent, 2 Psyker, 3 Support.
  - `src/content/heroes/standins.ts`: support stand-in keeps heal only (pull removed).
  - `src/content/waves.ts` / rules: respawn knobs and `wipeLoses: false`.
- **Bots and match:**
  - `src/bots/{types,brains}.ts`: `SeatInfo.kit`, `BrainTable` entries, and stub brains in `src/bots/{penitent,psyker}.ts`.
  - `src/content/bots.ts`: kitWeights entries.
  - `src/bots/standins.ts`: support stops posting pull.
  - `src/match/match.ts`: a `channelOf` case for the new command.
- **Perception:**
  - Move `heroParts` out to `src/perception/kits/{gunner,penitent,psyker,standin}.ts`. `perceive.ts` only dispatches.
  - Add `fallen` to `src/perception/types.ts`, plus kit/role unions.
- **Shell contracts (lead-owned):**
  - `src/client/shell/types.ts`: UiAction `callWave`; Effect kinds `respawn` and `prop`.
  - Prop drawn as a `segment` shape in `snapshot.ts` and `scene.ts`, at minimum.
- **Tests and tooling:**
  - Determinism: `test/determinism/scenario.ts` gets the new command, a hero death and respawn, and one cast per kit.
  - `test/sim/hash.test.ts`: `otherKit` swaps through all four kit kinds.
  - Engine-spec tests: hp floor, heal multiplier, the barrier clip, respawn revives at the spawn point, call-early starts the next wave, and an invariant that props are never targeted.
  - knip stub entries for the unwired files.
- **Success when:** `npm run ci` is green; all-bot games run 15 waves with the new lineup (the new kits are inert); a dead hero shows as fallen and comes back; the call-early command works through the scenario.

### Step 2: parallel slices (each in its own worktree; file sets are disjoint)

**A. Penitent kit and bot (M)**
- Owns:
  - `src/sim/heroes/penitent.ts`
  - `src/content/heroes/penitent.ts`
  - `src/perception/kits/penitent.ts`
  - `src/bots/penitent.ts`
  - `test/sim/penitent.test.ts`
- Builds: Pain resource, Wound-Zeal, Chain of Penance, and Martyrdom (half hp loss, full Pain banked, end nova, Spent state).
- Uses the step-1 hooks for damage taken (Pain banking, halving, the FF hp floor) and heals taken (×0.25).
- The bot reserves Martyrdom against a `pull` intent, at about +0.3 s offset, and moves to the pull point during the lead time.
- Tests are invariants only: Pain stays within 0–1000; FF never takes him below 1 hp during Martyrdom; Spent locks Pain at 0.

**B. Psyker kit and bot (M)**
- Owns:
  - `src/sim/heroes/psyker.ts`
  - `src/content/heroes/psyker.ts`
  - `src/perception/kits/psyker.ts`
  - `src/bots/psyker.ts`
  - `test/sim/psyker.test.ts`
- Builds: Warp and its decay, Gravitic Lash with the w-scaling, and backlash rolled on the kit RNG with Discharge as the only outcome.
- Perception shows backlash chance as a second ResourceView named `backlash`, so the HUD needs no change.
- The bot posts a `pull` intent at the clump with `fireInSeconds` 4.5.
- Tests are invariants only: Warp stays within 0–100; the backlash chance formula; the roll uses only the kit stream (the sim `rng` state is unchanged).

**C. Gunner Pavise (S–M)**
- Owns:
  - `src/sim/heroes/gunner.ts`
  - `src/content/heroes/gunner.ts`
  - `src/perception/kits/gunner.ts`
  - `src/bots/gunner.ts`
- Builds: slot 2 places a prop through `spawnProp`; `fireLine` uses `firstBarrier` to clip the line; Suppress code is removed.
- Uses step-1 props and `firstBarrier`.

**D. Solo loop 8a (M)**
- Owns:
  - `src/match/match.ts` (step 1 has already landed its `channelOf` line)
  - `src/match/run.ts`
  - `src/client/shell/{app,controls,config,hud,hudmodel,input}.ts`
- Builds:
  - `Match.setDriven(slots)`: selecting a hero makes it manual and hands the others to bots.
  - Bots honour each hero's autocast mask, filtered at Match level.
  - A call-wave HUD button and key (e.g. `N`).
  - Respawn countdown shown from `p.fallen`.
- Integration seam: also adds a `feedback?: FeedbackSink` hook in `app.ts` (`onStep(events, prevSnap, nowMs)` and `visualTime(nowMs)`), so E plugs in without touching `app.ts`.

**E. Payoff feedback 8c (M)**
- Owns:
  - New `src/perception/payoffs.ts`: a pure fold over events that detects "status applied by hero X, cashed by hero Y" and wombos (pull fired plus ≥2 reservations fulfilled).
  - New `src/client/shell/feedback.ts`: callouts, hitstop, and stings.
  - New `src/client/audio.ts`: WebAudio unlocked on the first pointer or key event.
  - Status visuals in `scene.ts`.
- Tests: detector unit tests on synthetic event streams.
- Hitstop dilates only visual and effect time (see risk 4).
- Depends on D's seam **by signature only**. The lead adds the one-line wiring at step 3.

**F. UI content (S)**
- Owns `src/content/{presentation,icons,help}.ts` and the help text.
- Covers Pain, Warp, backlash, the Penitent/Psyker/Pavise abilities, and the fallen/respawn and call-wave strings.
- No logic. The kit-agnostic fallbacks keep things rendering until this lands.

**G. Reporter readiness (S–M)**
- Owns:
  - `src/metrics/{gameindex,hero}.ts`
  - New `src/metrics/{penitent,psyker}.ts`
  - `docs/{EVENTS,METRICS}.md`
- Builds:
  - `gameindex` handles death followed by respawn (several downs per hero, total time down).
  - `ULT_SLOT` for Penitent (Martyrdom) and Psyker.
  - Per-kit metrics: Pain banked and spent, nova damage, Warp time above 50, backlash count, Pavise blocks.
  - Metric 9 switches from the intent proxy to `payoffs.ts`. G imports it read-only; it is E's file, so G codes against the signature fixed in step 1 (a stub that returns an empty list).

Dependencies: A, B, C, D, F and G depend only on step 1. E and G share `payoffs.ts` by signature.

### Step 3: integration (lead, S–M)

- Merge the slices; remove the knip stubs; wire `feedback` into `app.ts`.
- One golden regen.
- Watch all-bot games for the wombo firing; play the solo handoff by hand.
- **8d:** the lead runs a reporter batch (all-bot, several seeds, `report --base` against the pre-wave baseline) and reviews it with B.

## 2. Engine-prep details

- **Damage-taken hook.**
  - `TickContext.hooks.damageTaken({victim, spec, raw, amount}) → {amount, minHp}`. It is called in `dealDamage` after `modify()` and before `victim.hp -= amount`.
  - `sim.ts` builds it by dispatching to the kit function in `heroes/index.ts`, which avoids a combat → heroes import cycle (same pattern as `ctx.cast`).
  - The `dmg` event amount is the hp actually lost after the floor is applied. `raw` is the amount after armour and before kit halving; Pain banks it, and FF is scaled ×1.5 inside the kit.
- **Per-target heal multiplier.** `hooks.healTaken({target, amount}) → amount`, applied in `heal()`. The `heal` event reports the amount actually healed.
- **Hp floor.** The `minHp` from the hook is applied as `hp = max(hp - amount, minHp)` only when the incoming damage is from the same team (`ff`). This is generic, not Penitent-specific.
- **Generic per-hero resource.** Kept in kit state, not on Entity ("later slices do not add fields"). Each kit's hash function hashes it. Perception exposes it through the existing `ResourceView` (name, frac, band, marks), and the existing `resource` event fires on band changes. No shell change is needed.
- **Kit RNG.**
  - Add `seed` to TickContext. At spawn, `PsykerState.rng = deriveRng(seed, 'kit:psyker:' + entityId)`; the id comes from the deterministic `entities.nextId`.
  - The rng state lives in kit state and is hashed in `hashPsyker`, so the hash layout stays fixed. The sim stream `'sim'` is never drawn from.
- **Prop / barrier entity.**
  - EntityKind `prop`, code 4, appended to `ENTITY_KIND_CODE`.
  - Entity gains `prop?: {owner, until, angle, halfLength}`, hashed behind a presence flag. This is the only Entity field added; step 1 owns it.
  - `unitsInRadius`, `nearestHostile` and `unitsOnSegment` skip props, and so does `dealDamage`.
  - New `firstBarrier(entities, from, to, team?) → t | undefined` in `query.ts` does a segment–segment test with a detmath-only formula (no atan2: store the facing unit vector, not an angle).
  - A `propSystem` removes expired props and runs right after statuses.
  - Enemy single-target hits are blocked when their segment from attacker to target crosses a hostile Pavise. Step 1 adds a `firstBarrier` check in `enemies.ts` attack resolution.
- **Respawn.**
  - Heroes are no longer removed. `deaths.ts` emits `death`, sets `hero.respawnAt` (it lives in `KitBase`, so it is hashed), keeps hp at 0, clears statuses, sets move to idle, and calls the kit's `onDown` hook (Penitent: Pain resets).
  - Every system already skips hp ≤ 0. `movement.ts` and `commandHero` gain guards so a downed hero cannot move or take commands.
  - A new `respawnSystem` revives the hero at `heroSpawns[slot]` with full hp and emits a new `respawn` event (appended to the SimEvent union).
  - Timer = `ticks(min(rules.respawn.max, base + perWave × wave))`.
  - `rules.wipeLoses` defaults to false. When true, the game ends with EndReason `team-wiped` (appended).
- **Call early.**
  - Command `{kind: 'callWave'}`. `isValidCommand`, `canonicalCommand` and `applyCommand` set `waves.nextAt = tick`, so the normal `waveSystem` starts the wave the same tick.
  - It does nothing if the waves are exhausted, or in master mode when nothing is pending.
  - Match `channelOf` returns `'wave'`, which dedupes it per tick. Bots and the Director ignore it by default.
- **Leash.** Raise `LEASH_RANGE` from 10 to 13. `reachable()` subtracts attack range plus both radii, so the effective leash comes out at about 9.5–11.

## 3. Genuine risks and open questions for B

1. **Warp cannot build with the reduced kit.** Lash adds +20 every 10 s, while decay removes 4/s (40 per cooldown). Warp never passes 20, so backlash never happens. Options:
   - basic attacks add Warp (e.g. +4 per hit), or
   - decay runs only out of combat, or
   - Lash adds +45.

   Recommend: basic attacks add Warp.
2. **Does the Martyrdom nova damage allies?** F2 says B judges each new source. Recommend no; Discharge and the Gunner overpen already carry the FF weight.
3. **Does Pavise block only the overpen line, or also enemy single-target and ranged hits behind it?** The plan assumes both ("blocking FF and enemy hits behind it"), which needs the extra check in `enemies.ts`. Confirm.
4. **Hitstop in future netplay.** Freezing the local frame accumulator is fine solo, but it would stall lockstep later. The plan only dilates visual and effect time while the sim keeps stepping. Interpolation may then jump by about 2–3 ticks after a stop. Accept?
5. **Autocast for bot-driven heroes.** The plan has a bot cast an ability only while that ability's autocast bit is on. All bits default to on for bot-driven heroes and off when a human takes the hero over. Confirm, or should bots ignore the mask?
6. **Replays of driven games stay on the backlog** (B-E6AFQ5LENRZY2ANU). With `setDriven` the set of humans changes mid-game, so a solo game cannot be replayed yet.
7. **Wombo timing is tight.** The Penitent has to walk to the pull point within about 4.5 s; at long distance he misses. This is expected to show up in the reporter numbers rather than being tuned now.

## 4. Proposed wave success criteria (STATE.md)

- [ ] `npm run ci` is green; the determinism golden was regenerated once at integration; the reflective hash test covers all four kits and props.
- [ ] Solo: on `play.html` the player can pick any of the four heroes and take it over; the other three play as bots. Switching heroes mid-game hands control back and forth.
- [ ] The Penitent's Pain, Chain of Penance and Martyrdom (with the end nova and Spent) are visible in the HUD and in events. FF never takes him below 1 hp during Martyrdom, and heals on him are ×0.25.
- [ ] The Psyker's Warp and backlash chance are always shown; Lash pulls and applies Clumped; backlash rolls happen only on the kit stream.
- [ ] Pavise stops the Gunner's overpen line and enemy hits behind it.
- [ ] In all-bot games the Martyrdom wombo (pull, then Martyrdom, then Furnace Heart) fires at least once per game on most seeds.
- [ ] Dead heroes respawn on a timer that grows with the wave number. A team wipe does not end the game; only the Ancient's death does.
- [ ] The effective leash is about 10.
- [ ] Call-next-wave works by button and key on every wave, and goes through `command()`.
- [ ] Combo callouts, hitstop, status visuals and sound stings appear in the client after the first input, and none of them changes the sim hash.
- [ ] 8d: a reporter batch across the new lineup has run, with per-kit metrics, the real combo rate and respawn counts, and the lead and B have reviewed it.

### Critical Files for Implementation
- /home/agent1/devel/bhd/src/sim/combat.ts
- /home/agent1/devel/bhd/src/sim/heroes/index.ts
- /home/agent1/devel/bhd/src/sim/deaths.ts
- /home/agent1/devel/bhd/src/sim/heroes/gunner.ts
- /home/agent1/devel/bhd/src/match/match.ts