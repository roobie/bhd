---
created: 2026-11-01
---

# B-SSKZO5AG5ESSUXNV Process: the lead checks remote CI (gh run list) after each push, not only local npm run ci

## Why
Local npm run ci was green while remote CI was red for 8 pushes. Check gh run list after every push; could instead become a decision once a hook or routine exists.
## Notes
Wave 7 harvest.
