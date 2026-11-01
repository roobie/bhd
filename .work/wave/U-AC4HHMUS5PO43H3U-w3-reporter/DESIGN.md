# Design

## Problem
M1 exits when `bhd report --base A --cand B --tag gunner.heat` writes an HTML diff report, prints a summary table, and a Gunner heat tweak shows explainable movement, including at least one flagged metric outside the change. Today there is a deterministic all-bot `Match` and a debug viewer, and nothing else the reporter needs: no batch runner, log store, metrics, statistics, report or replay link (project DESIGN §7, items 5a–5f). Constraints: no gameplay assertions (D-4E4QRJ7N6LIGZDSD), and no Node code in sim or client.

Measurements at 380b733 on a 16-core machine:
- Director-mode games take 130–270 ms each (7,000–10,400 ticks). Schedule mode takes about 95 ms.
- One game produces 2,800–5,300 events, 210–400 KB as NDJSON.
- **Schedule mode ignores the seed.** In director mode the Director rng is the only source of variation, because doctrine `noise` is 0.
- `biome.jsonc` already allows Node and `console` in `src/reporter/**`. The `src/reporter/cli.ts` stub exists and `npm run bhd` points at it.

## Approach

### Module layout
- **Pure, runs in Node and the browser:** `src/match/run.ts`, `src/content/overrides.ts` and `src/replay/{log,verify}.ts`.
  - `src/match/run.ts`: `GameSpec` → `buildMatch` / `runGame`, plus `RUN_ABI = 1`. This is the code ABI that every ref snapshot must export.
  - `src/content/overrides.ts`: the config patch.
  - `src/replay/log.ts`: the NDJSON codec.
  - `src/replay/verify.ts`: compares hash checkpoints.
- **Node-only:** everything else lives in `src/reporter/`. Biome's override already covers it, and tsconfig already has node types.
  - knip `entry`: add `src/reporter/cli.ts!` and `src/reporter/worker.ts!`.
  - `test/reporter/layering.test.ts`: nothing outside `src/reporter/` may import it.
- **Running it:** `npm run bhd -- report ...`. Optionally add `"bin": {"bhd": "src/reporter/cli.ts"}` with a shebang; Node strips the types.
- **Output** goes to `.bhd/` (gitignored):
  - `snap/<sha>/`
  - `runs/<key>/{base,cand}/<lineup>-<seed>.ndjson.gz` plus `timing.json`
  - `reports/<key>/{index.html,report.json}`

### Log format (`src/replay/log.ts`; spec in `docs/EVENTS.md`, closes B-5BDTUBBCCH4CMW6S)
- One gzipped NDJSON file per game.
- **Line 1 is the header:** `{format:"bhd-log", v:1, abi:1, side, ref, sha, dirty, fingerprint, spec:GameSpec, resolved:{game,bots,director}, end:{tick,wave,reason}, ticks}`.
  - `resolved` is the config after overrides. Metrics read `maxHp` and slots from it without needing that ref's code.
  - `fingerprint` is the SHA-256 of the sorted sources in the pure dirs. This is the reporter half of B-LALPYHJRLNJOODZD.
- **Every following line is one `SimEvent`**, in emission order, including `choice`.
- **Encoder rules:**
  - Throw on non-finite numbers.
  - Write `-0` as `0` outside `cmd` events, which are already canonical (D-PYEECPV6MBQARWKG).
  - Keep keys in emission order.
- **Wall time goes in `timing.json`, never in logs.** Logs and `report.json` are byte-identical for the same inputs.
- Gzip happens on the Node side only.

### Runner and pool (5a, 5b; starts from B-2ZRW4IBQRBAY7DIV)
- `runGame(spec)` builds the Match exactly as the viewer does (`client/setup.ts` delegates to it), runs to the end or `maxTicks`, and returns the events, `resolved` and `end`.
- **Pool:** `node:worker_threads`, size `availableParallelism() - 1`.
  - Job: `{side root, spec, outPath}`.
  - The worker dynamically imports `<root>/src/match/run.ts`, writes the log itself, computes metric values in memory, and replies `{key, ticks, ms, values}`.
  - Messages are discriminated unions with a job id (B-73XE3F5W6NBN5BMT).
  - Results are sorted by `(side, lineup, seed)`, so the worker count never affects output.
- **Cache:** run key = `hash(fingerprint + overrides + spec)`. An existing log is reused.
- **Expected wall time:** a quick batch of 100 pairs takes about 4 s on 15 workers; a deep batch of 2,000 pairs takes about 1 min.
- `timing.json` records ms/game per side (B-ZCO2ETTNXWGZHXTM), and the report footer shows it.

### Scenario config and base vs cand
- **`GameSpec`:** `{abi, seed, mode, doctrines[4], reactionSeconds, thinkSeconds, maxTicks, hashEvery, overrides?}`. This is `ViewerConfig` plus fields, so any logged game opens in the viewer.
- **`Scenario`:** `{id, mode, seeds:{from,count}, lineups: doctrines[4][], reactionSeconds, thinkSeconds, maxTicks, hashEvery}`.
  - Built-ins: `quick` (100 games) and `deep` (2,000), both director mode with two lineups (all hold-the-line, all greedy).
  - `--scenario file.json` loads a custom one.
  - The runner warns "N distinct games of M" when hash sequences repeat.
- **Variation (lead decision):** the shipped doctrines get `noise` 0.05 in the contracts slice. Games then vary across seeds, and the reporter measures the game as shipped.
- **Overrides** `{game?, bots?, director?}` are deep-merged.
  - Arrays of objects with an `id` can be patched as id-keyed objects.
  - Unknown keys throw.
  - The result goes through `validateGame`.
- **base and cand:** each side is a git ref snapshot, optionally with an overrides file layered on top.
  - `--base`/`--cand` take a ref, `WORKTREE` (the default cand), `path.json` (the worktree plus overrides) or `ref:path.json`.
  - A ref resolves to a sha, then `git archive <sha> src index.html | tar -x -C .bhd/snap/<sha>`. Snapshots are cached and immutable.
  - Refs from before `run.ts` existed are rejected with a clear error.

### Metrics registry (5c, `docs/METRICS.md`)
`MetricDef = {id, title, unit, areas: string[], missing: 'zero'|'skip', compute(log: GameLog): Record<key, number>}`.
- Each `id[key]` is one series. When a key is missing on either side, a `skip` series drops that pair.
- `gameindex.ts` builds a shared index once per log:
  - entity → def, team and maxHp;
  - an hp tracker (dmg clamped at 0, heal, death);
  - intents;
  - alive enemies.

| # | id | per-game value | areas |
|---|---|---|---|
|1|`outcome.wave`|`end.wave`|outcome|
|2|`outcome.leaks`|leaks per wave started (`w<n>`)|outcome|
|3|`outcome.ancientHp`|Ancient hp fraction at each wave start and at the end|outcome|
|4|`hero.deaths`|deaths per hero def|`<hero>`|
|5|`hero.dmgShare`|each hero's share of team damage to enemies|`<hero>`|
|6|`team.ff`|ff damage per pair `src>dst`|team.ff|
|7|`gunner.heat.band`|fraction of alive ticks in each band b0/b60/b85/b100|gunner.heat|
|8|`ability.casts` / `.value`|casts and mean value per `hero:slot`|`<hero>.ability`|
|9|`combo.rate`|proxy: intent `fulfil` per kind per wave; payoff is the value of the fulfilling cast (lead decision until real combos exist in waves 6/8)|intents|
|10|`intent.fulfil` / `.latency`|fulfil/post per kind; mean ticks from post to fulfil|intents|
|11|`choice.spread`|time-weighted share per `hero:decision:option`, until the next pick, death or the end|`<hero>.choice`|
|12|`team.lowestHp`|lowest team hp fraction per wave and per game|team, outcome|
|13|`ult.timing`|at the first ultimate per hero: wave, team hp and enemies alive; plus cast count|`<hero>.ult`|

### Paired diff (5d, `stats.ts`)
- Pairs are the same `(lineup, seed)` on both sides; d = B − A.
- **Reported numbers:** mean d; relative change mean(d)/mean(A); and a percentile bootstrap 95% CI. The bootstrap uses 2,000 resamples for quick batches and 1,000 for deep, drawn from `detmath createRng` with a fixed seed.
- **Ranking:** effect size |mean d| / sd(A).
- **Noise floor:** a series is hidden if its CI contains 0, or |rel| is below the metric floor (default 2%), or it fails Benjamini–Hochberg at q = 0.1 across all series.
- **Tags** match areas by dot-segment prefix, in either direction.
  - A significant series that matches no tag is marked `outside`.
  - An unknown tag produces a warning listing the known areas.
- **Choice-spread table:** share per option for A and B, flagged when any option exceeds 90% (it has become a tax).
- **Histograms:** 12 bins over the shared A∪B range.
- **Divergence (`diverge.ts`):** for each top mover, take the pair with the largest |d| in the direction of the mean. Its divergence tick is the first tick where the non-`hash` events differ.

### Report (5e)
- **Data model:** `report.json` (`ReportData`) feeds two renderers:
  - `table.ts`: the CLI summary in the §6.5 format, with `← outside change` marks;
  - `html.ts`: one self-contained file with inline CSS and SVG histograms, no JS, all output escaped.
- **HTML sections:**
  1. a header: refs, shas, tags, pairs, ms/game, the distinct-games warning;
  2. movers inside the tags;
  3. movers outside the tags (flagged);
  4. choice spread;
  5. unchanged series, collapsed in a `<details>`.
- **Batch flags:** `--games N` (default 100), `--deep` (2,000), `--workers`, `--scenario`, `--out`.
- **Other commands:** `bhd run --side X --games N` and `bhd view <log> [--tick T]`.
- **Argument parsing:** a pure `parseCli(argv)` using `node:util` `parseArgs`.

### Replay links (5f)
- A log replays by rebuilding the Match from its header. Same spec, same `resolved` config and same code give the same game, with all viewer panels working.
- **`bhd view <log> [--tick T]`** (`reporter/view.ts`):
  - starts a Vite dev server rooted at the log's code, i.e. the repo or `.bhd/snap/<sha>`;
  - adds middleware that serves `/__bhd/log` decompressed;
  - opens `#log=/__bhd/log&tick=T`.
- **Viewer changes:**
  - `config.ts` parses `log` and `tick`.
  - `app.ts` fetches the log, builds the Match via `run.ts`, fast-forwards to `tick − 60` and pauses.
  - `replay/verify.ts` checks live hashes against the logged `hash` events and shows a banner: "verified", or "diverged at tick T". This is the minimal form of B-K2EH7VY64AAIZZ2F.
- The report shows copyable `bhd view` commands for A and B at the divergence tick.

### Tests (invariants and specced behaviour only)
- **Log codec:** round trip, `-0` normalisation, non-finite numbers rejected.
- **`runGame`:** the same spec gives identical events; the viewer's default spec matches the golden.
- **Overrides:** merge by id; unknown keys throw.
- **Pool:** 1 worker and 3 workers produce byte-identical logs (a short scenario, `maxTicks` 600, 6 games).
- **Refs and CLI:** ref/json/`ref:json` parsing, the cache key, and `parseCli` accepting good input and rejecting bad.
- **Metric queries on synthetic logs:** band time, clamped hp, choice intervals, latency.
- **Stats:**
  - bootstrap: a constant d gives a zero-width CI, the same seed reproduces, and the CI covers a known mean;
  - pairing, BH and tag matching;
  - divergence on synthetic logs.
- **Report:** HTML escaping, and stable `report.json` bytes.
- **Replay:** the config hash round-trip for `log`/`tick`; verify finds the first mismatch.
- **Layering:** nothing outside the reporter imports it.

## Slices

| step | slice | owned files | exit check |
|---|---|---|---|
|1|contracts|`src/match/run.ts`, `src/content/overrides.ts`, `src/content/bots.ts` (doctrine noise 0.05), `src/replay/log.ts`, `src/reporter/types.ts` (Scenario, SideSpec, MetricDef, PoolMsg, ReportData, ViewOptions), stubs with final signatures (`pool.ts:runBatch`, `metrics/registry.ts:computeMetrics`, `stats.ts:buildReport`, `html.ts`, `table.ts`, `view.ts:runView`), `src/client/setup.ts`, `docs/EVENTS.md`, `knip.jsonc`, `.gitignore`, `test/reporter/{layering,log}.test.ts`, `test/match/run.test.ts`, golden|ci green|
|2a|runner|`src/reporter/{pool,worker,sides,snapshot,store,scenarios}.ts`, `test/reporter/{pool,sides}.test.ts`|byte-identical logs with 1 and 3 workers; a 100-pair quick batch runs and ms/game is recorded|
|2b|metrics|`src/reporter/metrics/*.ts`, `docs/METRICS.md`, `test/reporter/metrics.test.ts`|all 13 metrics registered; synthetic-log tests green|
|2c|stats+report|`src/reporter/{stats,diverge,html,table}.ts`, `test/reporter/{stats,report}.test.ts`|bootstrap, BH, tag, divergence and render tests green|
|2d|cli|`src/reporter/{cli,args,commands}.ts`, `package.json` (bin), `test/reporter/args.test.ts`|`parseCli` tests green; `bhd help` works|
|2e|replay|`src/replay/verify.ts`, `src/reporter/view.ts`, `src/client/{config,app}.ts`, `test/client/config.test.ts`, `test/replay/verify.test.ts`|`bhd view <log> --tick T` opens paused at T, verified|
|3|lead|wiring, STATE evidence|demo below; ci green|

**Step-3 demo:**
1. On a branch, change `overpenAbove` from 0.85 to 0.80.
2. Run `bhd report --base main --cand <branch> --tag gunner.heat`.
3. Check that it writes HTML, prints the table, and flags at least one `outside` mover.

Then close or update B-2ZRW4IBQRBAY7DIV, B-5BDTUBBCCH4CMW6S and B-ZCO2ETTNXWGZHXTM, and note which parts of B-IRG3NYJANBQ6HCUY, B-LALPYHJRLNJOODZD and B-K2EH7VY64AAIZZ2F are still uncovered.

## Alternatives considered
- **Overrides only:** blind to bot, Director and sim code changes, which are the common case. Overrides stay as a layer on top of refs.
- **A `git worktree` per ref:** adds bookkeeping for the worktree registry and locks. `git archive` is enough.
- **A Vite bundle per ref:** not needed, because Node strips TypeScript types itself.
- **Child processes:** slower to start. Threads are enough.
- **Storing only commands:** metrics over old games would then need the old code. §6.5 says event logs come first.
- **A binary log format:** NDJSON plus gzip compresses about 10× and is easy to debug.
- **An events-only replay renderer:** events carry no positions. That belongs to wave 7.
- **Ranking by paired dz:** it inflates when pairs are near-identical.
- **A report page with JS:** a static single file is easier to share.

## Risks & open questions
- **Little variance between games.** Mitigated by doctrine noise 0.05, two lineups and the distinct-games warning.
- **Many comparisons:** BH plus the 2% floor. The report states how many series were tested.
- **Running `.ts` in worker threads:** relies on Node's type stripping, not Vite. Slice 2a must verify this first.
- **Disk:** a deep batch is about 160 MB. Add `bhd clean`.
- **`heal` events have no tags (B-ZWLSW3BITMQHPOLW):** not needed for M1.
