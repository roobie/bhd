---
date: 2026-11-01
read_if:
  - adding a hero kit or kit state
refs:
  - src/sim/heroes/index.ts
---

# L-BJW64NVZXOXD2BPX Kit state hashes through hashKit; kit functions take one run object

A kit's extra state must be hashed once, through its own hashX plus KitBase (hashKit); the hash test cycles the kit kinds. Biome's useMaxParams 4 pushes kit functions to take a single run object {ctx, hero, kit, def}.
