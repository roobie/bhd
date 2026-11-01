---
phase: finalize
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Every ability, resource and kit state of the default lineup has presentation, icon and help with no NaN/undefined/?; test/content/ui-content.test.ts passes
  - Help-open screenshots at 390x844 and 1280x720 for all four heroes look right
  - npm run ci exits 0
---

# slice/w8-ui-content

## Purpose
Real names, colours, icons and generated help for the Penitent, Psyker and Pavise content, replacing step-1 placeholders.

## Scope
In: src/content/{presentation,icons,help}.ts and tests.
Out: shell wiring of the new UI strings (slice D / integrator).

## Context & constraints
Numbers come only from content defs; no gameplay pinning.


## Now
Done; finalize.

## Next
- Integrator wires UI_TEXT, describeCallWave, describeFallen, describeResource, respawnText into the shell.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- npm run ci exit 0 (log scratchpad/w8-F-ci.log); screenshots in scratchpad/w8-F/

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] backlog: help shows the kit-state rows (Spent, Martyrdom, Discharge) in every hero's legend; a per-kit filter would need hudmodel.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
