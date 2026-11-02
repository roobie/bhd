# Plan: wave 9 bargains (Opus plan, 2026-11-02)

## Summary
- A bargain is a content-defined bundle of gains plus costs on other axes.
  - The sim offers it after chosen waves.
  - A `bargain` command accepts or declines it.
  - A modifier layer applies it. That layer is not hashed: it is rebuilt from the hashed list of accepted bargains.
- The engine does not depend on B2 (who picks).
  - Each card names who benefits.
  - Any player's command can resolve an offer; the first valid one in (player, seq) order wins.
  - Who may click is a Match or shell policy. Ownership checks come in wave 10.
- The only effect that can touch the Ancient is a heal (D-2PNKLSQWVJEBSWPI). Config validation and an engine invariant both enforce this.
- Step 3 compares three paired bot policies on the same seeds: decline-all, evaluate and accept-all. The comparison tests the pillar that declining must be a valid strategy, and shows whether a bargain is a tax or a trap.

## Code facts
- Waves overlap on a 20 s clock, so there is no quiet time between them. An offer therefore opens when a wave ends and stays open for a time window.
- `runKit` reads the def in one place, and so do perception and help. Swapping in an effective def at those points makes every kit tunable usable by bargains.
- `maxHp`, `armour` and `speed` are copied onto the entity at spawn. A bargain that changes them must rewrite the entity explicitly.
- New optional sim state needs a presence flag in the hash (D-ZWNGECNLCCFS7N6A).
- Bots read Perception only, so offers must be part of Perception.

## §B Design questions (sent to B)
- B1 timing
- B2 who picks
- B3 cost axes
- B4 permanence
- B5 initial pool
- B6 decline reward

B accepted every recommendation (see STATE Harvest).

| # | Bargain | Benefits | Gain | Cost |
|---|---|---|---|---|
| 1 | Unvented Barrel | Gunner | basic damage ×1.4 | heat never decays |
| 2 | Iron Discipline | Gunner | her overpenetration stops hitting allies | rounds never pierce armour |
| 3 | Hair Shirt | Penitent | Wound-Zeal max bonus ×1.5 | heals on him ×0 |
| 4 | Open the Eye | Psyker | Lash cooldown ×0.6 | backlash starts at 30 Warp, not 50 |
| 5 | Blood Tithe | team | Ancient healed by 25% of max hp, once | respawn timers ×1.5 for the rest of the game |
| 6 | Call the Horde | team | every hero deals ×1.2 damage | +2 Runners in every later wave; in master mode, wave-master budget instead |

**Offers**
- They open after waves 3, 6, 9 and 12. Each has 3 cards plus Decline.
- An offer lasts 20 s, and a lapse counts as a decline. The wave clock does not pause.
- Declining heals the Ancient by 4%.

**Who picks**
- Cards are team offers bound to a hero: the benefiting hero's player accepts.
- Solo: the human picks every offer. An opt-in toggle lets bots pick instead.

**Duration:** bargains are permanent.

## Step 1: engine-prep contract (lead slice; not blocked)
- **Content types:** new `src/content/bargains.ts`.
  - `BargainDef {id, scope, kit?, durationWaves?, gains, costs}`.
  - `BargainsDef {afterWaves, cards, windowSeconds, pauseWaves, declineAncientHeal, pool}`.
  - `GameConfig.bargains?` is optional; leaving it out turns bargains off.
  - Closed `Effect` kinds: `def` patch, `dealt`, `taken`, `healTaken`, `respawn`, `ancientHeal`, `waveExtra` (which becomes `masterBudget` in master mode). Each effect has a target: self, team or allies.
  - `validateGame` rejects any effect that could reach the Ancient, except `ancientHeal` with a value above 0.
- **Command:** `bargain` with `accept {offer, card}` and `decline {offer}`.
- **Event:** `bargain` with ops `offer`, `accept`, `decline`, `expire` and `end`. Add fields only; document them in EVENTS.md.
- **Sim state:**
  - `BargainState` is hashed behind a presence flag and uses its own RNG stream, `deriveRng(seed, 'bargains')`.
  - Tick order gains a bargains phase after waves.
- **Modifier hooks:** `ctx.mods.dealt`, `taken`, `heal` and `respawn`.
  - The stubs return 1.
  - In combat, `dealt` applies after the team check and before Marked; `taken` applies after armour and before the kit hook.
  - Leak damage skips both.
- **Effective def:** `heroDef(ctx, hero)` is used in `runKit` and in perception.
- **Wave hooks:**
  - `bargainExtras` in `startWave`.
  - `wavesPaused` in `waveSystem`.
  - `grantBudget` in master mode.
  - `healAncient`, kept separate from `heal()`.
- **Perception:**
  - `Perception.bargains {open: OfferView[], taken}`, where offers carry `EffectView`s.
  - `HeroView.bargains`.
  - The wave preview includes extra units added by bargains.
- **Match:**
  - A `bargain:<offer>` channel.
  - A `bargainPolicy` option with `bots`, `human` and `off`.
  - `BotSetup.bargain.policy` with `evaluate`, `declineAll` and `acceptAll`.
- **Shell:** a `bargain` UiAction and empty `HudModel.bargain` types.
- **Tests:** engine spec only.
  - Commands that resolve nothing are logged no-ops.
  - The reflective hash test covers bargain state.
  - The determinism scenario uses a test pool with one accept, one decline and one expire.

## Step 2: slices
- **A. Sim engine (L; not blocked).**
  - Owns `src/sim/bargains.ts`, `src/perception/bargains.ts`, the content patcher, and their tests.
  - Builds: opening offers on wave end, a seeded draw, accept and decline, cache rebuilds, entity stat rewrites, expiry, the decline reward, and wave extras or budget.
  - Invariant: Ancient hp goes down only through `leak` damage.
  - Risk: kits that cache values derived from the def at init.
- **B. Pool (S–M; blocked on B3–B6).** Owns `src/content/bargains/pool.ts`.
- **C. Bot evaluator (M; core not blocked, seat policy blocked on B2).**
  - Owns `src/bots/bargain.ts` and `src/content/bots/bargain.ts`.
  - A generic scorer over `EffectView`s, scaled by the situation.
  - Makes a `bargain.offer` choice: decline, or `accept:<card>`.
- **D. HUD cards and help (M; partly blocked on B1 and B2).**
  - Owns `src/client/shell/bargains.ts`, hudmodel, hud, controls, input, css and the content presentation files.
  - Cards are generated from effect values and show a countdown and a Decline button.
- **E. Reporter (S–M; not blocked).**
  - Owns `src/reporter/metrics/bargain.ts`, the registry and METRICS.md.
  - Adds accept, decline and expire rates per bargain, the Ancient heal amount, and the costs attributed to bargains.

## Step 3: integration
- Turn bargains on in `defaultGame`.
- Record decisions.
- Play solo by hand.
- Run reporter batches comparing evaluate with declineAll, and evaluate with acceptAll.
- Pillar readout:
  - Every bargain's accept rate falls between about 15% and 85%.
  - declineAll is not strictly dominated.
  - Ancient hp goes down only through leaks.
