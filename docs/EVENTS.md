# Events and the game log

The event stream is the source of truth for the reporter and for replays. The types live in
`src/sim/events.ts`; this page is the schema in prose plus the on-disk log format
(`src/replay/log.ts`). Field names are part of the stored format: add, don't rename.

## Events

Every event is `{tick, kind, ...}`. `tick` is the sim tick the event happened in. Events are listed
in emission order within a tick: the sim's events first, then the `choice` events of that tick
(emitted by `Match`, never by the sim). Entity ids are the sim's integer ids; `0` means "none" where
a field says so. Hero and enemy `def` strings are content ids.

| kind | fields | notes |
|---|---|---|
| `cmd` | `player`, `cmd` | A command applied at the start of `tick`, exactly as submitted (canonical form). `cmd` is a `Command` (see `src/sim/commands.ts`). `callWave` (call the next wave early) is a command like any other, so it shows up here; its effect is the next `wave` `start`. The call is refused silently (the command is still logged) while the current wave is still spawning, within `rules.callWaveMinSeconds` of the last wave start, once the waves are spent, and always in master mode (use `send` there). |
| `wave` | `n`, `phase` (`start`\|`end`), `composition[{def,count}]` | `n` is the 1-based wave number. |
| `spawn` | `id`, `def`, `team` | An entity appeared. A prop (a placed barrier such as the Gunner's `pavise`) spawns like any entity, with the placer's team; it is never targeted or damaged and is removed when it expires (`despawn`, no `death`). |
| `dmg` | `src`, `dst`, `amount`, `tags[]` | `tags` e.g. `ff`, `overpen`, `pierce`, `splash`, `ability:<id>`. Friendly fire needs the `ff` tag. `amount` is the hp actually lost after a kit's hooks (halving, the hp floor); a hook's output is clamped to finite and >= 0. Overkill is not trimmed: `amount` is the whole hit even when the target had less left (unless a floor applied), so clamp at its hp when summing. |
| `heal` | `src`, `dst`, `amount` | `amount` is what was actually restored (capped at max hp). No tags yet. |
| `status` | `dst`, `status`, `on`, `src` | A status turned on or off. |
| `ability` | `hero`, `slot`, `target`, `value` | A cast. `target` is an entity id or 0; `value` is filled when known, else 0. |
| `resource` | `hero`, `resource`, `band` | Band crossings only (e.g. heat 60/85/100). |
| `backlash` | `hero`, `warp`, `damage` | The Psyker's Discharge backlash fired. `warp` is his Warp when rolled, `damage` the per-target hit (`60 + warp`); the `dmg` events (tags `ff`, `splash`) follow it. |
| `death` | `id`, `killer` | `killer` is the entity that took it to 0 hp, 0 if unknown. An enemy is gone for good. A hero stays downed (hp 0, not targeted) until its `respawn`; one `death` per down. |
| `respawn` | `id` | A downed hero is revived at its spawn point with full hp (`src/sim/respawn.ts`; the delay is `rules.respawn`). |
| `block` | `src`, `dst?`, `prop` | A prop (Pavise) stopped a hit. Enemy melee: `src` the enemy, `dst` the unit it aimed at (the blocked swing costs the enemy a full attack period, so a block is one blocked hit). The Gunner's overpenetrating line: `src` the Gunner, `dst` the first unit behind the prop the line would have hit, absent if none. `prop` is the prop's entity id. |
| `despawn` | `id` | A prop's lifetime ended and it was removed (no `death`); `id` is the prop id its `spawn` named. |
| `leak` | `id`, `livesLost` | An enemy reached the Ancient; `livesLost` is the Ancient hp it cost. |
| `end` | `wave`, `reason` | The game is over (`ancient-destroyed`\|`victory`\|`team-wiped`, the last only when `rules.wipeLoses`); `wave` is the number of waves started. Gameplay stops after it. |
| `hash` | `stateHash` | State hash after `tick` completed, every `hashEvery` ticks. Replays compare these. |
| `intent` | `id`, `op`, `by`, `intentKind` | Intents board lifecycle. `op` is `post`\|`reserve`\|`fire`\|`fulfil`\|`expire`\|`cancel`; `by` is the hero the op concerns. |
| `bargain` | `offer`, `op`, `wave?`, `cards?[]`, `until?`, `card?`, `hero?` | Bargain lifecycle (`src/sim/bargains.ts`); `offer` is the offer id. `op` is `offer` (opened after wave `wave`; `cards` are the bargain ids on it; `until` the tick it lapses)\|`accept` (`card` taken; `hero` the entity id of the hero it benefits, 0 for a team card)\|`decline` (refused by command)\|`expire` (the window lapsed, counts as a decline; or, with `card` and `hero` set and no `end`, a timed bargain (`durationWaves`) ran out and its effects are gone)\|`end` (the offer is closed; follows every accept, decline and expire). Fields not listed for an op are absent. Only games with `GameConfig.bargains` emit it. The `bargain` command (`accept {offer, card}` or `decline {offer}`) shows up in `cmd`; an unknown offer or card, or an offer already resolved, is a logged no-op. A bargain `accept` may also emit a `heal` on the Ancient (`src` 0): the Ancient can be healed by bargains, never hurt. |
| `choice` | `hero`, `decision`, `options[{id,score}]`, `picked` | A bot decision between 2 or more options, emitted when first evaluated and whenever its pick changes. `options` are in the decision's fixed order; `picked` is one of their ids. Ids are the options' labels (`Option.label`, default the id): options that share a label (one per target) are one entry with the best score, so the log holds a category (`mark`), not an entity id. |

`combo` events arrive with the combo waves (6 and 8). Pain amounts and backlash rolls have no event of their own yet; see the assumptions in `docs/METRICS.md`.

## Log format (`bhd-log` v1)

One game is one NDJSON file (UTF-8, `\n` line ends, final newline). The reporter stores it gzipped
as `<lineup>-<seed>.ndjson.gz`; the codec itself (`encodeLog` / `decodeLog`) is pure text and does
no compression.

- **Line 1 is the header**:
  `{format:"bhd-log", v:1, abi, side, ref, sha, dirty, fingerprint, spec, resolved, end, ticks}`.
  - `abi`: `RUN_ABI` of the code that ran the game (`src/match/run.ts`).
  - `side`, `ref`, `sha`, `dirty`: where the code came from (`base`/`cand`, the ref as named, the commit, uncommitted changes).
  - `fingerprint`: SHA-256 of the sorted sources of the pure dirs. Equal fingerprints mean the same code.
  - `spec`: the `GameSpec` that determines the game: `{abi, seed, mode, doctrines[4], reactionSeconds, thinkSeconds, maxTicks, hashEvery, overrides?}`.
  - `resolved`: the config after overrides, `{game, bots, director?}`. Metrics read max hp, slots and so on from here without that ref's code.
  - `end`: `{tick, wave, reason}` where `reason` is an `end` event reason or `maxTicks` (cut off).
  - `ticks`: ticks stepped.
- **Every other line is one event**, in emission order, `choice` and `hash` included.

Rules of the encoder:

- Keys keep their emission order.
- A non-finite number (NaN, infinity) is an error, never written as `null`.
- `-0` is written as `0` (JSON has no negative zero). `cmd` events are canonical already (D-PYEECPV6MBQARWKG), so this never changes a command.
- Wall time never appears in a log. Logs for the same inputs are byte-identical; timings go in `timing.json`.

A log replays by rebuilding the Match from `spec` (the viewer and the reporter both build through
`src/match/run.ts`): same spec, same code, same events.
