---
status: accepted
date: 2026-11-01
read_if:
  - changing Gunner ally-in-line cost or lineAllies
  - a stand-in stands in the Gunner's line
refs:
  - src/perception/perceive.ts#lineAlliesOf
  - src/sim/heroes/gunner.ts#fireLine
---

# D-7A4T3X3CM4JFNU6K Line of fire is computed from the sim's fireLine geometry, independent of heat

## Context
Overpenetrating Gunner shots can hit allies. Bots need to cost that risk, both for the Gunner deciding to fire and for stand-ins deciding where to stand.

## Decision
Perception's ally-in-line set mirrors the sim's fire-line geometry (muzzle at the body edge, effective range with the brace bonus, only ahead of the muzzle) and ignores heat, so it names who an overpenetrating shot would hit. Stand-ins derive the line privately from the Gunner's position and target so they can cost any candidate spot.

## Why
A set that depended on heat or on a current target would flap or go empty while the Gunner holds fire. A privately derived line lets stand-ins evaluate hypothetical spots, which a per-current-state set cannot.

## Consequences
Perception geometry must be kept in step with the kit's fire line. The set is still empty with no target (see the backlog item on the would-be target).
