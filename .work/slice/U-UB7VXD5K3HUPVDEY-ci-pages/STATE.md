---
phase: execute
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - A QA workflow runs biome, tsc, knip, node tests and chromium+firefox browser tests on push and PR
  - Pushes to main deploy the Vite build to GitHub Pages, only after QA passes
  - First run on github.com/roobie/bhd is green and the Pages URL serves the client
---

# slice/ci-pages

## Purpose
Automated QA and publishing, so every push is gated by the full check suite and main is always live on Pages. B set Pages source to GitHub Actions (2026-11-01).

## Scope
In: .github/workflows, dependabot.
Out: branch protection settings (B sets in GitHub), deploy previews per PR.

## Context & constraints
Remote github.com/roobie/bhd was empty. Git via `mise x -- git` (GH token from mise.local.toml). Claude may commit, push, open issues/PRs.


## Now
Workflows written and reviewed (Opus); actions bumped to current majors, webkit added. Pushing.

## Next
- Push, watch first Actions run, confirm Pages URL.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
- [ ] backlog: branch protection requiring QA checks → B-JF3AUWP4HEI2CIYR
- [ ] backlog: README badge → B-7KV5ICYZFLWLB42V
- [ ] backlog: aggregate check job, path filters, timeouts → B-7CHB4AAW6K3VE4CT
- [ ] learning: knip `worker/**` pattern matches nothing yet (hint only; keep for workers wave)
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
