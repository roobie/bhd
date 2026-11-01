---
phase: finalize
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - The Psyker has a ranged basic attack (no melee tag) that adds Warp, Gravitic Lash (pull plus Clumped, scaled by Warp) and a seeded Discharge backlash on the kit RNG that never touches the sim rng
  - Perception reports Warp and a second resource named backlash; the bot posts pull intents at clumps and holds fire or casts less when a backlash would hit nearby allies
  - Invariant tests pass (Warp bounds, backlash formula, kit-stream-only roll, Lash geometry, legal bot commands) and npm run ci exits 0
---

# slice/w8-psyker

## Purpose
Make the Psyker playable for the solo-playable wave: Warp Gambler Y1 (D-4TKP7DQRMLBK6K7W) in its reduced form (D-ZQ7UANKFTPZIMMZW), with a bot.

## Scope
In: `sim/heroes/psyker.ts`, `content/heroes/psyker.ts`, `perception/kits/psyker.ts`, `bots/psyker.ts`, `content/bots/psyker.ts`, tests; the appended `backlash` event.
Out: Rift backlash, Warp Lance (both deferred past M2); UI wording (slice F).

## Context & constraints
Engine hooks from step 1 are live. No gameplay pinning before v1.0.

## Now
Done; in finalize.

## Next
- Integrator regenerates the golden.

## Evidence
- `npm run ci` exit 0 (log: scratchpad w8-B-ci.log), 838 node + 123 browser tests.
- Bot-only Matches (solo and master) post and fire pull intents and cast Lash.

## Harvest
- [ ] learning: test/reporter/metrics.test.ts resolved the real run against legacyGame(); a hero absent from the resolved game gets Infinity max hp and NaN metrics once it takes damage.

## Log
- 2026-11-01 initialized
- 2026-11-02 implemented kit, perception, bot, tests; new `backlash` event appended to events.ts and EVENTS.md
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
