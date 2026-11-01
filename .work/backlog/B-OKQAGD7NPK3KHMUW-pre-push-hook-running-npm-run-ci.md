---
created: 2026-11-01
---

# B-OKQAGD7NPK3KHMUW Pre-push hook running npm run ci

## Why
Nothing stops a red `npm run ci` from being pushed.

## Notes
skelly uses `.githooks/pre-push` with `core.hooksPath`; that would bypass the dev-proc hooks in .git/hooks, so combine them in one hooks directory.
