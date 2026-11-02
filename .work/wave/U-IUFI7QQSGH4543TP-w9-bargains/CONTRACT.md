# w9 bargains: engine-prep contract (step 1)

Every shared-file edit is landed. Step-2 slices fill the STUBs below and touch only their own files.
With `GameConfig.bargains` unset nothing runs: `Sim.bargains` is undefined, mods are exact identity
(`x * 1`), event streams are identical to before; hashes differ only by one presence byte.

## Content: `src/content/bargains.ts` (B owns the pool, A the patch logic)
- `Effect` (closed union, each with `target: 'self'|'team'|'allies'`): `def {path, op:'mul'|'add', value, enemy?}`,
  `dealt|taken|healTaken|respawn|ancientHeal|masterBudget {value}`, `waveExtra {def, count}`.
- `BargainDef {id, scope:'hero'|'team', kit?, durationWaves?, gains, costs}`;
  `BargainsDef {afterWaves, cards, windowSeconds, pauseWaves, declineAncientHeal, pool}`.
- `GameConfig.bargains?` (content/index.ts), absent from `defaultGame`. `validateGame` -> `validateBargains`:
  unknown def path / enemy, `leakDamage` path, `ancientHeal` not in (0,1], ids, scope/kit, windows.
- STUB (A): `applyDefPatches(def, effects)`, identity today.

## Commands and events
- `BargainCommand`: `{kind:'bargain', op:'accept', offer, card: <bargain id>} | {op:'decline', offer}`
  (commands.ts: shape, canonical, routed to `applyBargainCommand`). Unknown offer/card or a second
  resolution: silent no-op, the `cmd` event is still logged.
- `BargainEvent {kind:'bargain', op:'offer'|'accept'|'decline'|'expire'|'end', offer, wave?, cards?, until?, card?, hero?}`
  (events.ts, documented in docs/EVENTS.md). Emitting them is A's.

## Sim: `src/sim/bargains.ts` (slice A)
- `BargainState {rng, nextOffer, opened, offers: Offer[], taken: TakenBargain[]}`; own rng `deriveRng(seed,'bargains')`.
  `hashBargains` covers every field, hashed behind a presence flag after the master section. A new field MUST be hashed.
- Tick order: respawns, commands, intents, waves, **bargainSystem**, statuses, props, movement, kits, enemies, deaths, hash.
- STUBs (A): `createMods(game, state)`, `heroDef(src, hero)`, `bargainExtras(src)`, `wavesPaused(ctx)`,
  `grantBudget(ctx)`, `bargainSystem(ctx)`, `applyBargainCommand(ctx, cmd)`.
- `ctx.mods = {dealt(src, spec), taken(victim, spec), heal(target, amount), respawn(hero)}` (context.ts),
  identity today. `dealt`: combat.ts `dealDamage`, after the team check, before Marked; `taken`: after armour, before
  the kit hook; leak damage skips both. `heal` multiplies in `heal()`; `respawn` in `respawnTicks`
  (`max(1, round(ticks * mod))`).
- `heroDef(ctx, hero)`: effective def, used by `runKit` and perception.
- Hooks: `bargainExtras` in `startWave` (extras join start event composition and queue; the `end` event lists scheduled
  groups only; schedule mode), `wavesPaused` in `waveSystem` condition (`canCallWave` untouched: A decides),
  `grantBudget` in master `takePending` (master mode).
- `healAncient(ctx, amount)` (combat.ts): caps at max hp, emits `heal` with src 0; `heal()` still refuses the Ancient.
  Invariant: the Ancient loses hp only to `leak`.

## Perception (slice A fills, C and D read)
- `Perception.bargains {open: OfferView[], taken: TakenView[]}`; `OfferView {id, wave, expiresAt, ticksLeft, cards: CardView[]}`;
  `CardView {bargain, scope, hero, gains, costs: EffectView[]}`; `EffectView {kind, target, value, path, op, def}`
  (flat, '' when not applicable); `HeroView.bargains: string[]`. STUBs in `src/perception/bargains.ts`:
  `perceiveBargains`, `heroBargains`. Kit views already get the effective def.
- Schedule-mode `wave.preview` appends `bargainExtras`.

## Match and bots (slice C)
- Channel `bargain:<offer>`; `MatchOptions.bargainPolicy: 'bots'|'human'|'off'` (default bots);
  `BotSetup.bargain?: {policy: 'evaluate'|'declineAll'|'acceptAll'}` (default evaluate).
- STUB (C): `bargainDecisions(ctx, policy)` in `src/bots/bargain.ts`: decision id `bargain.offer`, options
  `decline`, `accept:<card>`. Called per bot-seat think when policy is `bots`; reads Perception only.

## Shell (slice D)
- `UiAction {kind:'bargain', offer, card?}` (no card = decline); `HudModel.bargain: BargainHudModel | undefined`
  (`{offers: BargainOfferModel[]}`, offer models are `{offer}` for now); `buildHudModel` returns undefined.

## Tests and fixtures
- `test/bargains-fixture.ts` `testBargains()`: test-only pool valid against the default roster (E and tests may reuse).
- `test/sim/bargains.test.ts`: command shape, no-op commands, presence flag, event equivalence, validation rejections.
- `test/sim/hash.test.ts`: reflective bargains-field test. `test/determinism/scenario.ts`: `ScenarioResult.bargains`.
- Existing tests that hand-build a `TickContext` / `HashedState` / `HeroView` got the new fields.

## knip ignores (knip.jsonc `ignoreIssues`; trim as stubs get consumers)
- `src/content/bargains.ts` exports+types, `src/sim/bargains.ts` types, `src/sim/combat.ts` exports (`healAncient`),
  `src/perception/types.ts` types, `src/client/shell/types.ts` types.

## Notes for step 2
- `ancientHeal` / `masterBudget` target semantics, `pauseWaves` vs `canCallWave`, `durationWaves` expiry: A decides.
- B's shipped pool must pass `validateGame`; reuse the fixture's shapes.
