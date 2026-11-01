# Metrics

Per-game series computed from a `GameLog` (header `resolved` config and `end`, plus the events) by
`src/reporter/metrics/`. A series is `id[key]` (`id` alone when the key is empty). `skip` drops a
pair when a key is missing on one side; `zero` counts it as 0. Hero keys use the hero def id. Waves
are `w<n>`, the wave in force when the event happened. Hp comes from a tracker that clamps damage at
the target's remaining hp, so overkill never counts.

| # | id | definition | keys | areas | missing |
|---|---|---|---|---|---|
| 1 | `outcome.wave` | `end.wave`: waves started | none | `outcome` | zero |
| 2 | `outcome.leaks` | leaks while that wave was in force | `w<n>` for each wave started | `outcome` | skip |
| 3 | `outcome.ancientHp` | Ancient hp fraction at each wave start and at the end | `w<n>`, `end` | `outcome` | skip |
| 4 | `hero.deaths` | deaths per hero def (0 for heroes that lived) | `<hero>` | `hero` | zero |
| 5 | `hero.dmgShare` | the hero's clamped damage to enemies / the team's | `<hero>` | `hero` | zero |
| 6 | `team.ff` | clamped damage from one hero to another | `<src>><dst>` | `team.ff` | zero |
| 7 | `gunner.heat.band` | fraction of gunner alive ticks (spawn to death or game end) in each heat band | `b0`, `b60`, `b85`, `b100` | `gunner.heat` | zero |
| 8 | `ability.casts`, `ability.value` | `ability` events, and their mean `value` | `<hero>:<slot>` | `hero.ability` | zero (casts), skip (value) |
| 9 | `combo.rate` | proxy: intent `fulfil` events per kind per wave; `:payoff` sums the `value` of the fulfilling hero's latest cast. Replace when real combos exist (waves 6/8) | `<kind>:w<n>`, `<kind>:w<n>:payoff` | `intents` | skip |
| 10 | `intent.fulfil`, `intent.latency` | fulfils per post by kind; mean ticks from post to fulfil | `<kind>` | `intents` | skip |
| 11 | `choice.spread` | time-weighted share of each option: a pick counts until the next pick of that decision, the hero's death or the game end | `<hero>:<decision>:<option>` | `hero.choice` | zero |
| 12 | `team.lowestHp` | lowest hero hp / hero max hp, per wave and over the game | `w<n>`, `game` | `team`, `outcome` | skip |
| 13 | `ult.timing` | at each hero's first ultimate cast: wave, team hp fraction, enemies alive; plus the cast count. Ultimate slot: kit table (`gunner` 3), else the hero's highest ability slot | `<hero>:wave`, `:teamHp`, `:enemies`, `:casts` | `hero.ult` | skip |

Rows 8 and 10 are two registered defs each, so the registry holds 15 `MetricDef`s for the 13 metrics.
