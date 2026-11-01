---
date: 2026-11-01
read_if:
  - changing biome.jsonc includes
  - running biome --write over the repo
refs:
  - biome.jsonc
---

# L-R2FU3EYYIB6ELBFN Biome formats markdown and breaks YAML front matter

## Observation
`biome check --write` on Biome 2.6 also formats `.md` files. In `.work/` STATE.md it put blank lines inside the front matter and re-indented list items, so the YAML no longer parsed. The `files.includes` excludes in biome.jsonc prevent this.

## Why it matters
dev-proc reads that front matter, so a repo-wide fix run can silently break the work tracking. Keep markdown out of Biome unless its markdown formatter learns to preserve front matter.
