---
status: accepted
date: 2026-11-01
read_if:
  - changing bhd view or the log/tick viewer config
  - a replayed log shows diverged or runs past its end
refs:
  - src/reporter/view.ts#runView
  - src/client/replay.ts#loadReplay
  - src/replay/verify.ts#verifyHashes
---

# D-2EI5EVVJJOH2YTXT Replay mode in the viewer: log is origin-restricted, edits leave replay, runView builds its own server

## Context
Any logged game must replay in the debug viewer at a chosen tick, verified against the log, without changing the plain viewer.

## Decision
ViewerConfig gained optional log and tick; a tick without a valid log is dropped, and the log must be on this origin, relative, http(s) or blob. Editing any control leaves replay mode; Reset re-runs the replay. The viewer stops at the log's tick count. runView builds its own vite server with no config file (the root config pulls in test tooling) and finds the code from the header: the repo for WORKTREE, else the archived snapshot.

## Why
Restricting the log URL blocks javascript: and data: injection through the hash. Replay state lives in its own client module so app.ts stays small. Running the logged code, not the current code, is what makes the verify banner meaningful.

## Consequences
A +dirty WORKTREE log still replays on the current tree (see backlog). The viewer without log is untouched.
