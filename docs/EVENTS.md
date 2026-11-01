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
| `cmd` | `player`, `cmd` | A command applied at the start of `tick`, exactly as submitted (canonical form). `cmd` is a `Command` (see `src/sim/commands.ts`). |
| `wave` | `n`, `phase` (`start`\|`end`), `composition[{def,count}]` | `n` is the 1-based wave number. |
| `spawn` | `id`, `def`, `team` | An entity appeared. |
| `dmg` | `src`, `dst`, `amount`, `tags[]` | `tags` e.g. `ff`, `overpen`, `pierce`, `splash`, `ability:<id>`. `amount` can exceed what the target had left; clamp at its hp when summing. |
| `heal` | `src`, `dst`, `amount` | `amount` is what was actually restored (capped at max hp). No tags yet. |
| `status` | `dst`, `status`, `on`, `src` | A status turned on or off. |
| `ability` | `hero`, `slot`, `target`, `value` | A cast. `target` is an entity id or 0; `value` is filled when known, else 0. |
| `resource` | `hero`, `resource`, `band` | Band crossings only (e.g. heat 60/85/100). |
| `death` | `id`, `killer` | `killer` is the entity that took it to 0 hp, 0 if unknown. |
| `leak` | `id`, `livesLost` | An enemy reached the Ancient; `livesLost` is the Ancient hp it cost. |
| `end` | `wave`, `reason` | The game is over (`ancient-destroyed`\|`victory`); `wave` is the number of waves started. Gameplay stops after it. |
| `hash` | `stateHash` | State hash after `tick` completed, every `hashEvery` ticks. Replays compare these. |
| `intent` | `id`, `op`, `by`, `intentKind` | Intents board lifecycle. `op` is `post`\|`reserve`\|`fire`\|`fulfil`\|`expire`\|`cancel`; `by` is the hero the op concerns. |
| `choice` | `hero`, `decision`, `options[{id,score}]`, `picked` | A bot decision between 2 or more options, emitted when first evaluated and whenever its pick changes. `options` are in the decision's fixed order; `picked` is one of their ids. |

`combo` events arrive with the combo waves (6 and 8).

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
