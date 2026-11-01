# Design

## Problem
Wave 1 (project DESIGN.md §7) turns the bare sim core into a lane defense with combat: map + enemies + wave spawning (1a), damage/armour/statuses (1b), the Gunner (1c), three placeholder heroes (1d). The four slices share the entity model, commands, events and the state hash, so they cannot all start in parallel without a shared contract.

## Approach
Three steps:
1. **sim-contracts** (one agent): fixes every shared type and file below, with minimal working stubs, and replaces the wave-0 placeholders (B-GLHTOKUXFDT5U2ZC).
2. **lane-waves ∥ combat-core**: each in its own git worktree, owning disjoint files.
3. **gunner ∥ stand-in-heroes**: same, on top of step 2.
I merge each step, regenerate the determinism golden once per merge, and run `npm run ci`.

### Content is data passed in, not imported
`new Sim({ seed, game })` where `game: GameConfig` holds map, waves, enemy/hero/status defs and the 4-hero lineup. `src/content` exports `defaultGame()`. The reporter (wave 5) compares two configs, so tuning never needs a code change. Content is authored in **seconds and per-second** units for readability; sim code converts with helpers in `src/sim/time.ts` (`ticks(seconds)` rounds to integer ticks, `perTick(perSecond)`). Sim logic counts integer ticks only.

### Entity model (owned by contracts; later slices do not add fields)
One record per entity: `id, kind ('hero'|'enemy'|'ancient'), def (content id), team (0 defenders, 1 attackers), x, y, radius, hp, maxHp, armour, speed, statuses, move, attack, kit?`.
- `statuses`: array of status instances `{status, until, src, value}`, kept sorted by status code then src. Logic is combat-core's.
- `move`: `{mode: 'idle'|'point'|'lane', tx, ty, waypoint}`.
- `attack`: `{cooldown (ticks left), target (id or 0)}`.
- `kit`: hero-only, a discriminated union of per-kit state (`gunner`, `standin`), defined in each kit's own file.
No projectiles in wave 1: hits are instant; overpenetration is a segment query.

### Files and owners
| Owner | Files |
|---|---|
| contracts | `sim/{sim,entities,commands,events,context,hash,query,time,movement,deaths}.ts`, `sim/heroes/index.ts` (kit dispatch), `content/index.ts` (GameConfig, defaultGame), `content/types.ts` (shared def shapes), determinism scenario + golden |
| lane-waves | `sim/waves.ts`, `sim/enemies.ts`, `content/{map,enemies,waves}.ts` |
| combat-core | `sim/combat.ts`, `sim/statuses.ts`, `content/statuses.ts` |
| gunner | `sim/heroes/gunner.ts`, `content/heroes/gunner.ts` |
| stand-in-heroes | `sim/heroes/standins.ts`, `content/heroes/standins.ts` |
Contracts creates every file above with a minimal working stub so each later slice only fills its own files. Tests go in `test/<area>/`.

### Shared APIs (signatures fixed by contracts, bodies may be stubs)
- `dealDamage(ctx, {src, dst, amount, tags}) → number dealt` (combat.ts). Stub: hp −= amount. combat-core adds armour, pierce, statuses, friendly-fire flag. Never removes entities; the deaths system does.
- `applyStatus(ctx, dst, status, src, durationTicks, value)` / `hasStatus` / `statusValue` (statuses.ts).
- Queries (query.ts), all in ascending ID order, ties broken by lower ID: `unitsInRadius`, `nearestHostile`, `unitsOnSegment(x0,y0,x1,y1,halfWidth)`.
- `heal(ctx, {src, dst, amount, tags}) → healed` (combat.ts), emits `heal`; `removeStatus(ctx, dst, status, src?)`.
- **Hooks so later slices stay in their files:** enemy aggro targets a live `taunted` status's src first; `rooted` status zeroes speed and blocks move (Brace); `suppressed` slows via `effectiveSpeed` (combat-core); leak damage carries a `leak` tag and bypasses modifiers; `clumped` is applied by the stand-in pull.
- **Systems skip dead actors** (hp ≤ 0) until the deaths system removes them; queries never return them.
- Kit base state `hold` + `autocast` mask is shared, set by the dispatcher and hashed for every kit.
- Hero kits (heroes/index.ts): `{ init(def), tick(ctx, hero), command(ctx, hero, cmd), hash(hasher, state) }` dispatched on `kit.kind`.

### Commands (replace spawn/move placeholders)
`move {hero, x, y}`, `stop {hero}`, `hold {hero, on}` (hold fire), `ability {hero, slot 0–3, x?, y?, target?}` (slot 3 = ultimate; toggles such as Brace are abilities), `autocast {hero, slot, on}`. Shape checks only; semantic no-ops on bad targets. No ownership checks until wave 10. A debug `spawn {def, x, y}` stays for tests, marked debug.

### Tick order
commands → waves (spawn) → statuses (expire) → movement → hero kits (resources, attacks, abilities) → enemies (aggro, attack, leak) → deaths (emit `death`, remove; Ancient at 0 → `end`) → hash.

### Events (all wave-1 kinds defined by contracts, §6.6)
`cmd, wave, spawn {id, def, team}, dmg, status, ability, resource, death, leak, end {wave, reason}, hash`. `combo`, `intent`, `choice` arrive in waves 2–3.

### State hash
`hash.ts` hashes every entity field in a fixed order, then statuses, then `kit.hash`. A new kit field must be added to its kit's `hash` (L-53OTZPIIVO2XYNNL).

## Alternatives considered
- **All four slices at once against interface stubs:** shared files (entities, events, hash, golden) would be edited concurrently. Rejected.
- **ECS with component tables:** more indirection than ~200 units need; one record per entity hashes and debugs simply. Revisit if perf demands it.
- **Content imported as module constants:** blocks A/B config comparison in the reporter. Rejected.
- **Projectiles:** not needed for the Gunner kit; instant hits plus segment queries are cheaper and deterministic. Add when a hero needs travel time.

## Risks & open questions
- **Ancient takes only `leak` damage and cannot be healed** (lead default after review; §2 mentions the Ancient's health as a cost axis, so B may want ff/bargains to reach it later). Self-hits never apply.
- **Status semantics beyond Suppressed (slow) are provisional** (Marked, Exposed, Clumped): numbers are free to tune, but the mechanics go to B at the wave report.
- **Gunner third ability:** Suppressing Fire (B, provisional, revisit later).
- **Friendly fire** only on damage that carries the `ff` flag; only Gunner overpenetration sets it (§3 default, §10 Q1).
- **Stand-in heroes** use generic ability types (taunt, mark, heal pulse, pull) with no resources; clearly marked placeholders.
