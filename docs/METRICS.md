# Metrics

Per-game series computed from a `GameLog` (header `resolved` config and `end`, plus the events) by
`src/reporter/metrics/`. A series is `id[key]` (`id` alone when the key is empty). `skip` drops a
pair when a key is missing on one side; `zero` counts it as 0, so a pair missing on both sides is 0 vs 0 and stays in the sample. A series with fewer than 10 pairs is untested: p = 1, never a mover, left out of the Benjamini-Hochberg family. Hero keys use the hero def id; per-hero areas come from that key (`gunner`, `gunner.ability`, `gunner.ult`, `gunner.choice`), so `--tag gunner` covers all of them and a stand-in hero uses its own name. Waves
are `w<n>`, the wave in force when the event happened. Hp comes from a tracker that clamps damage at
the target's remaining hp, so overkill never counts.

| # | id | definition | keys | areas | missing |
|---|---|---|---|---|---|
| 1 | `outcome.wave` | `end.wave`: waves started | none | `outcome` | zero |
| 2 | `outcome.leaks` | leaks while that wave was in force | `w<n>` for each wave started | `outcome` | skip |
| 3 | `outcome.ancientHp` | Ancient hp fraction at each wave start and at the end | `w<n>`, `end` | `outcome` | skip |
| 4 | `hero.deaths` | deaths per hero def (0 for heroes that lived) | `<hero>` | `<hero>` | zero |
| 5 | `hero.dmgShare` | the hero's clamped damage to enemies / the team's | `<hero>` | `<hero>` | zero |
| 6 | `team.ff` | clamped damage from one hero to another | `<src>><dst>` | `team.ff` | zero |
| 7 | `gunner.heat.band` | fraction of gunner alive ticks (spawn to death or game end) in each heat band | `b0`, `b60`, `b85`, `b100` | `gunner.heat` | zero |
| 8 | `ability.casts`, `ability.value` | `ability` events, and their mean `value` | `<hero>:<slot>` | `<hero>.ability` | zero (casts), skip (value) |
| 9 | `combo.rate` | proxy: intent `fulfil` events per kind per wave; `:payoff` sums the `value` of the fulfilling hero's latest cast. Replace when real combos exist (waves 6/8) | `<kind>:w<n>`, `<kind>:w<n>:payoff` | `intents` | skip |
| 10 | `intent.fulfil`, `intent.latency` | fulfils per post by kind; mean ticks from post to fulfil | `<kind>` | `intents` | skip |
| 11 | `choice.spread` | time-weighted share of each option: a pick counts until the next pick of that decision, the hero's death or the game end | `<hero>:<decision>:<option>` | `<hero>.choice` | zero within a decision; a pair where the decision is absent on either side is skipped |
| 12 | `team.lowestHp` | lowest hero hp / hero max hp, per wave and over the game | `w<n>`, `game` | `team`, `outcome` | skip |
| 13 | `ult.timing` | at each hero's first ultimate cast: wave, team hp fraction, enemies alive; plus the cast count. Ultimate slot: kit table (`gunner` 3), else the hero's highest ability slot | `<hero>:wave`, `:teamHp`, `:enemies`, `:casts` | `<hero>.ult` | skip |

| 14 | `hero.downtime`, `hero.respawns` | ticks a hero spent down (an unfinished down counts to the game end), and its `respawn` events | `<hero>` | `<hero>` | zero |
| 15 | `gunner.pavise` | `casts`: `ability` events of the gunner in slot 2; `blocks`: `block` events | `casts`, `blocks` | `gunner.pavise` | zero |
| 16 | `penitent.pain` | `banked`: Pain estimated from damage taken (see below); `spent`: the Martyrdom casts' `value`, else the biggest nova hit of the burst / `novaPainMult` | `banked`, `spent` | `penitent.pain` | zero |
| 17 | `penitent.nova` | clamped `splash` damage from the penitent, to enemies and to allies | `enemies`, `allies` | `penitent.nova` | zero |
| 18 | `psyker.warp.high` | fraction of psyker alive time with its `warp` resource band at or above `backlash.freeBelow` (50) | `high` | `psyker.warp` | zero |
| 19 | `psyker.backlash` | Discharge = `dmg` from the psyker tagged `backlash`, or `ff` + `splash`: `count` (distinct ticks), clamped `damage`, and the `ffDamage` part that hit heroes | `count`, `damage`, `ffDamage` | `psyker.backlash` | zero |
| 20 | `bargain.accept` | accepts / times the bargain was on a resolved offer (accept, decline or expire). Bargains never offered have no key | `<bargain id>` | `bargain.<id>` | skip |
| 21 | `bargain.decline`, `bargain.expire` | share of resolved offers declined by command, and lapsed (a lapse counts as a decline in the sim, here it is kept apart). Offers still open at the end are ignored | `all`, `w<offer wave>` | `bargain` | skip |
| 22 | `bargain.ancientHealed` | Ancient hp restored by `heal` events: `decline` (same tick as a decline or expire), `accept` (same tick as an accept: Blood Tithe), `other`, `total` | `decline`, `accept`, `other`, `total` | `bargain`, `outcome` | zero |
| 23 | `bargain.extras` | ESTIMATE: wave extras spawned. The sim does not tag them, so this sums the `waveExtra` counts of the accepted cards (from the logged config) for every wave started after the accept. Schedule mode, permanent cards; master mode's `masterBudget` is not counted | `<enemy def>` | `bargain` | zero |
| 24 | `bargain.ff` | ESTIMATE: hero-to-hero clamped damage per 1000 ticks from a bargain's first accept to the end; `none` is the rate before any accept. Concurrent bargains each get the full rate, so it is correlation, not cause | `<bargain id>`, `none` | `bargain.<id>` | skip |
| 25 | `bargain.respawn` | ESTIMATE: mean death-to-respawn ticks of completed downs that began after the bargain's first accept; `none` is before any accept. Same caveat | `<bargain id>`, `none` | `bargain.<id>` | skip |
| 26 | `bargain.any`, `bargain.outcome` | 1 if the game accepted at least one bargain (0 if offers happened and none was), and the waves started / final Ancient hp fraction filed under `accepted:` or `declined:`. The report's mean of a key is then the group's mean. Games with no offer have no keys | `` / `accepted:wave`, `accepted:ancientHp`, `declined:wave`, `declined:ancientHp` | `bargain`, `outcome` | skip |
| 27 | `bargain.ancientViolations` | violations of the invariant "the Ancient loses hp only through `leak` damage" (see below); expected 0 | none | `bargain`, `outcome` | zero |

Rows 8, 10, 14, 21 and 26 are two registered defs each, so the registry holds 33 `MetricDef`s.

## Down and respawn

A hero is not removed by a `death`: it is down (hp 0) until its `respawn`, and a game can hold
several downs per hero. `GameIndex` keeps each hero's `downs` (`{from, to}`, `to` undefined while
down at the end) and `aliveSpans`; team hp recovers at a respawn, a downed hero takes no damage and
no heal, and time-in-state metrics (heat band, Warp) count alive time only (a band carries across a
down). `deathTick` of a hero is the start of the down it is in, undefined when it is up. Enemies are
unchanged: a `death` or `leak` removes them for good. `hero.deaths` therefore counts downs.

## Ultimate slots

`ult.timing` uses a table in `hero.ts`: `gunner` 3 (Furnace Heart), `penitent` 3 (Martyrdom),
`psyker` 0 (its reduced kit is Gravitic Lash alone). Content has no slot table for these kits, so a
changed slot has to be changed there too.

## Assumptions about the new kits' events

The kits are built in parallel with these metrics; these are what the metrics read, to reconcile
once the kits land:

- **Pain** is not in the log (`resource` events carry bands only). `banked` rebuilds it: the clamped
  hp lost by a penitent, divided by `martyrdom.hpLossMult` inside a Martyrdom window (cast tick +
  `seconds`), times `pain.friendlyFireMult` for `ff` hits. A `resource` pain amount or an `ability`
  `value` on the Martyrdom cast would replace the estimate.
- **Nova** hits are `splash` `dmg` events from the penitent.
- **Warp** `resource` events carry the band's lower bound in Warp points.
- **Pavise blocks** read `{kind: 'block', src, dst?, prop}` events (src the attacker, dst the protected target, prop the barrier id), which the sim emits when a Pavise stops an enemy hit or the Gunner's line. `despawn {id}` (a prop expiring) is not read by any metric.
- **Backlash** with no target in range emits no `dmg`, so it is not counted.
- Metric 9: `combo.rate` stays on the intent proxy; `combo.payoffs` (`wombo:w<n>`, `cashin:<status>`) counts real combos with `foldPayoffs` (perception/payoffs.ts), the same pure fold the client feedback uses.

## Bargains

Rows 20-27 read the `bargain` events (`offer`, `accept`, `decline`, `expire`, `end`, docs/EVENTS.md).
`--tag bargain` selects all of them, `--tag bargain.<id>` one bargain's series. A game with
bargains off has no `bargain` events and the skip metrics have no keys.

**Invariant check.** `ancientViolations(log)` (`metrics/bargain.ts`) returns one line per violation
of "the Ancient loses hp only through `leak` damage" (D-2PNKLSQWVJEBSWPI): a `dmg` on the Ancient
without the `leak` tag, or a fall of the tracked Ancient hp at any other event. The metric
`bargain.ancientViolations` is its count, so a batch where any game violates it shows as a mover
(a base with 0 against a candidate above 0). The integrator can also call it directly over each
batch log and fail on a non-empty result.

**Override files.** `scenarios/bargains-decline.json` and `scenarios/bargains-accept.json` set
`bots.bargain.policy` (`declineAll`, `acceptAll`; `evaluate` is the default), for
`report --base WORKTREE --cand scenarios/bargains-decline.json` or `X:scenarios/...`. Overrides
cannot add a key the base lacks, and neither `game.bargains` nor `bots.bargain` exists in the
defaults yet. The integrator must, in step 3, put `bargains: {...defaultBargains pool and rules}`
into `defaultGame()` and `bargain: {policy: 'evaluate'}` into `defaultBotSetup()`; the files then
apply as they are. Until then a side with these files fails with `unknown key bots.bargain`.
