---
status: accepted
date: 2026-11-01
read_if:
  - tuning Director tension, budgets or sends
  - changing how waves are bought or unlocked
refs:
  - src/director/tension.ts#updateTension
  - src/director/director.ts#createDirector
  - src/sim/master.ts#sendWave
---

# D-JE653COQC4PMHDQJ Wave master and Director defaults; the Director paces and never plays to win

## Context
B's open questions on the wave master were answered with lead defaults and accepted on 2026-11-01: the whole roster is available with no hand, budget carries over, early send is allowed, the game has a fixed wave count with a victory, reservations auto-cast for humans too with no lock, and the Director paces and never plays to win.

## Decision
The Director drives tension from damage taken, leaks and low-hp heroes, cycles build, peak and relax, and buys from data-driven budget fractions per phase. Sends happen only at peak and only if they land inside the send window.

## Why
A Director that played to win would remove the reason to watch it; pacing tension gives the build, peak, relax rhythm the game is designed around. Keeping the numbers in content keeps tuning out of logic.

## Consequences
Tension numbers are content and expected to move in tuning passes; unlocks are refused by the sim, so Director and master content must agree.
