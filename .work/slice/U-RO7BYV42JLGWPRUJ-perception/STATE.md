---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - 'claude (agent)'
created: 2026-11-01
success_criteria:
  - 'ci green (npm run ci exits 0)'
  - 'clumps cover each enemy exactly once, in the specced sweep order'
  - 'lineAllies is filled for the Gunner (muzzle to target, effective range)'
---

# slice/perception

## Purpose
The real perception layer (DESIGN section Perception): clumps, threat, combo windows, memory, lineAllies, team aggregates.

## Scope
In: src/perception/{perceive,memory,clumps,threat,combos}.ts, content/perception.ts, additive fields in perception/types.ts, test/perception.
Out: bots, Match, sim.

## Context & constraints
Shapes fixed by w2-contracts; additions only.

## Now
Done; awaiting lead merge.

## Next
- Lead: merge.

## Evidence
- npm run ci exit 0 (28 node files / 468 tests, 12 browser files / 78 tests); 12 new tests in test/perception/perception.test.ts.
- Perf: 1000 perceive calls with 100 densely packed enemies (default heroes) took about 40 ms (0.04 ms each).

## Harvest
- [ ] decision: additive fields: HeroView.recentDamage (fraction of max hp lost in the memory window), TeamView.livesLost; PerceptionDef.comboStatuses and comboMinCount (comboWindowSeconds kept, unused).
- [ ] decision: lineAllies mirrors the sim's fireLine geometry (muzzle at body edge, effective range with brace bonus, ahead of muzzle only), independent of heat, so it names who an overpenetrating shot would hit.
- [ ] decision: threat also counts enemies already targeting the hero, at any distance.
- [ ] decision: combo windows are per (clump, status) over comboStatuses (clumped, marked, suppressed), centred on the carriers, until = latest carrier expiry.
- [ ] learning: the purity scan bans Math.hypot in src/perception.
- [ ] backlog: comboWindowSeconds is dead config; drop or give it a meaning (needs first-seen memory keyed by zone).

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize -> execute
- 2026-11-01 implemented, tests, ci green
- 2026-11-01 phase execute -> finalize
