---
date: 2026-11-01
read_if:
  - briefing parallel worktree agents
refs:
---

# L-WBI36R65C4HCTCAE Isolated worktree agents have Bash refused for heredocs and variable-expanded commands, and /tmp/ci.log is shared by parallel agents; use Write/Edit, literal paths and per-agent log paths

## Observation
Parallel worktree agents shared a CI log path and had Bash refuse heredocs and variable-expanded commands.

## Why it matters
Brief agents to use Write/Edit, literal paths and per-agent log files.
