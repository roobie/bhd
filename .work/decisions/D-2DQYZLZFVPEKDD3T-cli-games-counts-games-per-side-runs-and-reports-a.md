---
status: accepted
date: 2026-11-01
read_if:
  - changing bhd report/run flags or output dirs
refs:
  - src/reporter/args.ts#parseCli
---

# D-2DQYZLZFVPEKDD3T CLI: --games counts games per side, runs and reports are keyed by content hash

## Context
The CLI must be usable with a single flag for size, and reruns should land in predictable places.

## Decision
--games N means games per side, converted to a seed count over the scenario lineups; with --scenario the file's seeds win. Runs go to .bhd/runs and reports to .bhd/reports under content hashes unless --out is given.

## Why
Per-side counts match how the paired statistic is read. Content-hash dirs let identical requests reuse logs and reports. The rounding up to whole lineups is a known wart (see backlog).

## Consequences
parseSideSpec is pure in args.ts and reused by side resolution. Exit codes are 0 ok, 2 usage, 1 failure.
