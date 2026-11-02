---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - play.html with `#room=` runs lobby then lockstep game (coop.ts); without a room, solo is unchanged
  - TickDriver, DriverStatus and DriverNotice live once, in src/net/types.ts
  - The lobby hello carries a build fingerprint covering the pure dirs and the lockstep net files
  - The wire has `refuse`, `end` and parallel `names`; PROTOCOL_VERSION is bumped
  - The step-1 review leftovers (L1 to L4, L6, M2, M4, H2) are fixed or deferred with a reason
  - The determinism scenario replays sealed inputs across runtimes; the harness has a positive bot-hero accept path
  - Two tabs of Chromium play over real WebRTC through BroadcastChannel signalling (test/net/two-tabs.e2e.ts)
  - npm run ci is green
---

# slice/w10-integration

## Purpose
Wire the six step-2 slices into play.html and close the step-1 review leftovers, so co-op works end to end in two tabs.

## Scope
In: coop wiring, type unification, fingerprint, wire gaps, review leftovers, determinism and harness additions, the two-tab script, cleanup of knip stubs.
Out: deploying the Worker (B), host migration, rejoin, adaptive delay, the wave-master seat.

## Context & constraints
Plain git in this worktree, never pushed. No gameplay pinning tests.

## Now
Opus review fixes (H1, H2, M1 to M7, L1 to L7) done in this branch; waiting for the re-review and the lead's merge.

## Next
- Lead: merge, ask B to deploy the Worker, set the TURN secrets and `ALLOWED_ORIGINS` (unset = every origin).

## Evidence
See the wave STATE.md Evidence section. Review fixes: `npm run ci` green; test/net halts every peer at the host's pause tick (seeds 21-23); flood, oversized-seal, racing-accept, pause-input tests; rtc fake-timer tests; broadcast lock-election tests; ws events; lobby recovery.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] learning: mountShell builds its driver twice (the eager one, then the setup `restart()`); disposing the first sent `bye`, so a networked game ended on every peer at tick 0. The shell now builds an injected driver only in `restart()`. Only a real two-page run showed it: the in-process harness never goes through the shell.
- [ ] learning: lit keeps its render state on the root element, so a second game needs a fresh HUD root (and canvas) rather than `replaceChildren()`.

- [ ] learning: the harness drove peers with its own target maths, so the pause-boundary bug (host and clients halting at different ticks) passed every test; driving peers through the shell's pure `planFrame` / `stepBudget` / `canStep` is what exposed it.
- [ ] decision: ICE servers travel in the room's `joined` message and `/turn` is gone; `ALLOWED_ORIGINS` limits `/new` and `/ws` (unset allows every origin).
- [ ] backlog: a rate-limited `/new` or per-IP join limit in the Worker (origin checks are not authentication).

## Log
- 2026-11-02 review fixes: lockstep host hardening, rtc timeouts, lock-based host election, ICE in joined, coop end/kick/bye
- 2026-11-02 initialized
- 2026-11-02 execute: wiring, types, wire, fingerprint, determinism, two-tab script
