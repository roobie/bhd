---
created: 2026-11-01
---

# B-J2ZF2R4VC5PCWPXL Replay of a +dirty WORKTREE log runs on the current tree, not the tree that made it; compare the fingerprint, not only the verify banner

## Why
A log made on a dirty tree records the ref WORKTREE+dirty, so the viewer replays it on whatever the tree is now; only the verify banner warns, after the fact.

## Notes
Compare the header fingerprint with the current tree before loading. See src/reporter/view.ts#runView.
