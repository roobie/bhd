---
phase: finalize
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Pain stays within 0..max, banks raw damage (friendly fire x1.5), drains out of combat, resets on down; heals on him are x0.25
  - 'Martyrdom: half hp loss, full Pain banked, friendly fire never below 1 hp, end nova on enemies only (knob), then Spent (Pain locked 0, armour down, no Chain)'
  - Perception exposes pain, martyrdom and spent as ResourceViews
  - The bot taunts for threatened allies, reserves Martyrdom against a pull intent and walks to the pull point, and casts on its own when clearly valuable
  - npm run ci exits 0 (golden regenerated locally, not committed)
---

# slice/w8-penitent

## Purpose
Wave 8 slice A: the Penitent kit (Pain, Wound-Zeal, Chain of Penance, Martyrdom) and its bot.

## Scope
In: sim/content/perception kit files, bot brain and weights, invariant tests.
Out: HUD text and icons (slice F), reporter metrics (slice G).

## Context & constraints
Step-1 hooks (damageTaken, healTaken, downKit) already route to the kit. No gameplay pinning in tests.

## Now
Done; in finalize.

## Next
- Integrator: regenerate the golden; slice F adds presentation for the `martyrdom` and `spent` resources.

## Evidence
- npm run ci exit 0, log at the scratchpad path given in the prompt.
- All-bot probe game: Penitent casts Chain and Martyrdom.

## Harvest
- [ ] learning: heal/ff/reporter tests that name a hero by slot id broke when the lineup's slot 1 became the Penitent (heal x0.25, ff floor); tests should avoid the Penitent as a generic target.

## Log
- 2026-11-01 initialized
- 2026-11-02 implemented kit, perception, bot, tests; fixed two lineup-dependent tests outside ownership (mechanics heal, metrics log header)
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
