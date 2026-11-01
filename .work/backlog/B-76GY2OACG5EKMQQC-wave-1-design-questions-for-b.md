---
created: 2026-11-01
---

# B-76GY2OACG5EKMQQC Wave-1 design questions for B

## Why
Wave 1 shipped with several provisional rules that B must decide before they harden into reporter baselines (wave 5). Batched here so they go to B once. Existing records: D-TNP23ZZKAA2V3VS3 (damage and status numbers), D-6XEPR4POWBUM74EM (Suppressing Fire), D-FZ2FXOOFFRB5P2YL (leash).

## Notes
- Provisional status semantics: Marked +25% damage taken, consumed on hit; Exposed -5 armour for 3 s; Clumped +30% to line/cone/splash for 2 s; Suppressed -40% speed for 3 s. Keep, retune or replace?
- The Ancient takes leak damage only and cannot be healed. Should bargains be able to hurt or heal it?
- Friendly fire scope is overpenetration only (the ff tag). Should other sources be able to hit allies?
- Leash reach threshold: because a lane enemy only keeps a hero it can reach inside the leash, the effective leash is about 6-8, not LEASH_RANGE (10). Options: aggro-on-damage (enemy keeps a target that hit it), or raise LEASH_RANGE.
- The Gunner's third ability, Suppressing Fire, is provisional (see D-6XEPR4POWBUM74EM). Confirm or replace.
