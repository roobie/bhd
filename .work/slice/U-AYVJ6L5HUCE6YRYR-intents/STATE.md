---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - 'claude (agent)'
created: 2026-11-01
success_criteria:
  - 'ci green (npm run ci exits 0)'
  - 'lifecycle tests cover post/fire/expire, reservations (fulfil/expire, limits, refusals), cancel rules, removal after last reservation, poster dead, reserver dead or on cooldown, op order within a tick'
  - 'all board state is hashed, shown by a reflective hash test over a board built through the real lifecycle'
---

# slice/intents

## Purpose
Make the intents board real: reserve, cancel rules, reservation resolution and removal (src/intents/board.ts).

## Scope
In: src/intents/board.ts, src/content/intents.ts (unchanged), test/intents/.
Out: other slices' files, step-1 tests.

## Context & constraints
Contract stub from w2-contracts; lifecycle spec in the board.ts header comment.

## Now
Done; finalize.

## Next
- Lead: merge, regenerate golden on conflict.

## Evidence
- npm run ci exit 0; test/intents/board.test.ts 25 tests; golden regenerated (master script's reserve now real).

## Harvest
- [ ] decision: a poster's cancel expires its reservations at once (`expire` by each reserver, ascending hero id); a reserver cancel works any time before it resolves.
- [ ] decision: a failed (expired) or fired intent lingers while reservations remain; only a pending intent (unfired, tick < fireTick) blocks the poster's next post, so re-posting is allowed after fire/expire. Lingering intents count toward maxLive.
- [ ] decision: a hero may not reserve its own intent; reserver must be a live hero.
- [ ] decision: a reserve/cancel command applied at the fireTick tick is too late (commands run before the intents phase).

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize -> execute -> finalize; board implemented, tests, golden regenerated
