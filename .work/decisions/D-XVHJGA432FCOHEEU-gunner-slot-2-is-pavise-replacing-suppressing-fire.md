---
status: accepted
date: 2026-11-01
read_if:
  - implementing or changing Gunner ability slots
  - looking for a source of Suppressed
refs:
  - src/content/heroes/gunner.ts
  - src/sim/statuses.ts#applyStatus
supersedes:
  - D-6XEPR4POWBUM74EM
---

# D-XVHJGA432FCOHEEU Gunner slot 2 is Pavise, replacing Suppressing Fire

## Context
Wave 6 design checkpoint (2026-11-01): B answered the questions on the M2 kits and rules. Slot 2 was provisionally Suppressing Fire.

## Decision
B chose G3 Pavise for slot 2: a barrier the overpen line stops at, so neither friendly fire nor enemy hits pass. Suppressing Fire is replaced.

## Why
Trading reach for the tank's safety makes it a negotiation tool. Rejected: G1 keep Suppressing Fire (weak payoff until the loop exists) and G2 Redline Surge (overlaps Furnace Heart).

## Consequences
Needs a prop entity and a fireLine clip; it can become a tax. OPEN POINT FOR B: in M2 nothing applies Suppressed, so the Suppressed to Psyker link of the status loop has no source. The Psyker cash-in (Warp Lance) is not in the reduced M2 kit anyway. Replacing the ability shifts reporter baselines and invalidates replays.
