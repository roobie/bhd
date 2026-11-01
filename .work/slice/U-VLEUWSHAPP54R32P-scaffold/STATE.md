---
phase: finalize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Folder layout from DESIGN.md §6 exists (src/sim, detmath, content, perception, bots, intents, director, reporter, replay, client, net; worker/; docs/)'
  - '`npm run ci` runs lint, strict typecheck and Vitest, and passes on a trivial test'
  - '`npm run dev` serves a Vite page; Node runs a `.ts` entry point directly'
---

# slice/scaffold

## Purpose
Slice 0a: toolchain and layout everything else builds on.

## Scope
In: package.json, tsconfig (TS 7 strict, ES modules), Vite, Vitest, Biome, knip, lit-html, CI script, empty src folders.
Out: any sim logic; the banned-API check (determinism-harness owns it).

## Context & constraints
Mirrors skelly/deadvox (B, 2026-11-01). Single package.

## Now
Done; finalizing.

## Next
- Close; hand off to detmath + sim-core.

## Evidence
- `npm run ci` (biome ci, tsc, knip, vitest): green, 13/13 layout tests pass.
- `vite` dev server serves index.html and transforms src/client/main.ts (lit-html resolved); `npm run build` OK.
- `node src/reporter/cli.ts` (`npm run bhd`) prints usage; unknown command exits 1.

## Harvest
- [x] decision: TS 7 strict toolchain mirroring deadvox → D-NTY5JV4V7WOXX6OA
- [x] decision: lit-html for UI → D-L4YBMBS6WHJFMHK2
- [x] decision: drop the prototype → D-KSV7KSI3V23XZGVT
- [x] learning: Biome formats markdown and breaks front matter → L-R2FU3EYYIB6ELBFN
- [x] backlog: lit-analyzer → B-5I4XKEE3TYN4IRCU
- [x] backlog: pre-push hook → B-OKQAGD7NPK3KHMUW

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 scaffolded; Biome reformatted .work markdown on first `--write`, repaired and excluded
- 2026-11-01 phase execute → finalize
