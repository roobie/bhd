# Step 1 contract (as landed, from the step-1 report)


CI ran before the last commit, which only repoints three decision-file symbol refs; those commit hooks reported the stale refs, and I did not re-run CI after fixing them.

## Hook and API signatures for step 2
- **`src/sim/context.ts`**
  - `Hooks.damageTaken(ctx, {victim, spec, raw, amount}) -> {amount, minHp}`. The `minHp` floor applies only to same-team hits.
  - `Hooks.healTaken(ctx, target, amount) -> number`.
  - `TickContext` also carries `seed` and `hooks`.
- **`src/sim/heroes/index.ts`**
  - `heroHooks` dispatches to the Penitent's `damageTakenPenitent(run, hit)` and `healTakenPenitent(run, amount)`.
  - `downKit(ctx, hero)` runs once per down.
- **Kit functions** take one run object `{ctx, hero, kit, def}`: `tickX`, `commandX`, `downX`, `hashX`, `initX`. Psyker's `initPsyker(def, rng)` also takes the rng; its seed is `deriveRng(ctx.seed, 'kit:psyker:' + nextId)`, and the rng words are hashed. `KitBase` (`hold`, `autocast`, `respawnAt`) is hashed once in `hashKit`, so each kit hashes only its own extra fields.
- **Props**
  - `spawnProp(ctx, {def, owner, x, y, ux, uy, halfLength, durationTicks})` in `src/sim/props.ts`.
  - `firstBarrier(entities, from, to, team?)` in `src/sim/query.ts`. With `team`, only other-team props block (enemy melee); without it, every prop blocks (the Gunner's line of fire).
  - `(ux, uy)` is the unit vector along the barrier.
- **Respawn** (`src/sim/respawn.ts`): `isDowned(e)`, `respawnLeft(e, tick)`, `downHero`, `respawnSystem`. A downed hero stays in the store with hp 0 and `kit.respawnAt > 0`. The `respawn` event is `{kind: 'respawn', id}`.
- **callWave**: the command is `{kind: 'callWave'}`, handled by `callWave(ctx)` in `waves.ts`. It sets `waves.nextAt = min(nextAt, tick)`, does nothing once waves are spent, and does nothing in master mode with no pending waves. The match channel is `'wave'`, so duplicate calls in one tick collapse into one.
- **Rules** (`src/content/rules.ts`): `RulesDef{leashRange: 13, respawn: {base: 10, perWave: 2, max: 45}, wipeLoses: false}`. `wipeLoses` true ends the game with `team-wiped`.
- **Perception** (`src/perception/kits/{parts,gunner,standin,penitent,psyker}.ts`): `Perception.fallen` is `FallenView{id, slot, def, respawnTicks}`. Downed heroes are left out of `heroes`.
- **Shell**
  - `UiAction` has `{kind: 'callWave'}`, and `controls.ts` emits the command.
  - `Effect.kind` has `respawn` and `prop`; `respawn` is emitted from the event, while `prop` is drawn but no event emits it yet.
  - Props appear in snapshots with `radius` set to the half length and `facing` set to the barrier direction.
  - `scene.ts` draws a prop as a `SHAPE.segment` and a downed hero dimmed.

## Per-slice file ownership
It matches PLAN, with these deviations:
- **Slice C (Pavise):** I did a basic working Pavise in `sim/heroes/gunner.ts` and `content/heroes/gunner.ts` so the shared types compile. `bots/gunner.ts` has no Pavise decision yet, and the old `gunner.suppress.*` weights are gone.
- **Slice F (UI content):** `content/{help,presentation,icons}.ts` have placeholder entries for `pavise`, `chain`, `martyrdom` and `lash`, plus the `pain` and `warp` resources, so the coverage tests pass. Slice F should replace the wording and icons.
- **Slice D (solo loop):** I touched `client/shell/{types,snapshot,controls,scene}.ts` for the shell items above. `match/match.ts` only gained the `channelOf` line.
- **Slice E (feedback):** `scene.ts` already has the `respawn` and `prop` effect cases.
- **Slice G (reporter):** untouched.

## Knip
Clean with no stub entries added to `knip.jsonc`, because the stubs are reachable through the kit and brain tables. The "worker/**" configuration hint was already there.

## Live versus inert
- **Live:** the hooks, props and `firstBarrier`, respawn, `callWave`, the leash read from rules, Pavise, the new lineup (Gunner, Penitent, Psyker, Support), and the shell wiring.
- **Inert:** the Penitent and Psyker kits and their brains, whose abilities are no-ops. Pain and Warp stay at 0. Their bot weights are `{}`.

## Golden and scenario
- The scenario now has a support hero with 5 hp that dies at tick 62 and respawns at 362, and a `callWave` from two players on the same tick (930). Penitent slots 0 and 3 and the Psyker's Lash are cast. The game still ends with `ancient-destroyed`.
- Golden was regenerated; the commit body says why.
- Engine-spec tests are in `test/sim/engine-hooks.test.ts` and assert mechanics only. They cover the floor (ff only), heal scaling, barrier clip, props never targeted, expiry, respawn and `team-wiped`, and `callWave`.
- An all-bot Match ran 15 waves without throwing. The master game reached victory at wave 15; the solo game ended at wave 11 with `ancient-destroyed`, which is expected while the new kits do nothing.

## Surprises and risks
- The decision files `D-2BOISI7VSLW2ZX3F`, `D-FZ2FXOOFFRB5P2YL` and `D-7A4T3X3CM4JFNU6K` had refs to symbols that moved (`LEASH_RANGE`, `lineAlliesOf`), and the commit hook reported them. I repointed the refs in the second commit.
- `test/legacy.ts` keeps the old stand-in lineup (`legacyGame`, `rosterGame`) for tests that need tank and ranged stand-ins; slices that add tests can reuse it.
- Taunted enemies now stop at the 13-unit leash, so the standins taunt test places its tank at +30.
- Friendly-fire hits need the `ff` tag, or `blockedByTeam` drops them. This matters for Martyrdom's `novaHitsAllies`.
- Slice STATE.md is at `finalize`, not closed, as instructed.