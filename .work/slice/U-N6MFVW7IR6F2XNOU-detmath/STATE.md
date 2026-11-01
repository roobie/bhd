---
phase: finalize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Seeded RNG with derivable named streams (game seed → bot/director streams); same seed gives same sequence
  - Deterministic sin, cos, atan2, hypot using only arithmetic and Math.sqrt, tested against reference values within a stated error bound
  - No Math.sin/cos/tan/atan2/exp/log/pow/hypot or Math.random in src/detmath
---

# slice/detmath

## Purpose
Slice 0b: deterministic math and RNG for lockstep (DESIGN.md §6.1).

## Scope
In: src/detmath only.
Out: fixed-point arithmetic (floats with IEEE-exact ops are allowed).

## Context & constraints
Starts after scaffold. Owns src/detmath exclusively.

## Now
Done (subagent); reviewed and integrated.

## Next
- Close.

## Evidence
- `src/detmath/index.ts`: sfc32 RNG, createRng/deriveRng/cloneRng/nextU32/nextFloat/nextInt; sin/cos/atan2/hypot/wrapAngle/angleDiff; PI/TAU.
- `npx vitest run test/detmath`: 24/24 (KAT vectors, stream independence, nextInt bounds; trig vs Math within 2^-51 (sin/cos, |a| ≤ 1e6) and 2^-50 (atan2); banned-API scan of src/detmath).
- Full `npm run ci` green (54 tests).

## Harvest
- [x] decision: sfc32 + hashed named streams → D-T5AKUZHCO4HRQI5K
- [x] decision: fdlibm polynomial trig → D-MOXM2Y76JJ4SZP2F
- [x] learning: pinned KAT vectors → L-C6VTW54YAGSQHHHQ
- [x] learning: Biome idioms → L-ZN7SSMFEBPMSB5WP
- [x] backlog: general banned-API scan incl. `**` → moved into slice/determinism-harness
- [x] backlog: run KATs/trig in a browser → moved into slice/determinism-harness

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 implemented by subagent; harvested; phase → finalize
