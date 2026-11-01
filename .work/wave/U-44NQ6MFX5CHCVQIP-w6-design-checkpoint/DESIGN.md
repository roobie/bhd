# Design: wave 6 checkpoint, proposals for B

Scope (project DESIGN §7, 6a): the Penitent and Psyker kits, the Gunner's third ability and friendly-fire scope. B decides, and nothing is built before sign-off. All numbers are rough first values in engine units. Drafted by an Opus planner on 2026-11-01 from the code at 380b733.

## 0. What the engine supports today
- The Gunner's kit is fully built. Suppressing Fire is already live in slot 2 (12 dmg, a 100° cone, Suppressed, +10% heat, 10 s cooldown), and D-6XEPR4POWBUM74EM marks it provisional.
- Damage pipeline, in order:
  1. a `leak` short-circuit;
  2. team rules: hits on your own team need `ff`, and you never hit yourself;
  3. Marked, consumed by the hit;
  4. Clumped, which applies only to `line`/`cone`/`splash` hits;
  5. armour, reduced by Exposed (`pierce` skips armour);
  6. a 20% damage floor.

  The Ancient takes only leak damage.
- Friendly fire: only the Gunner's overpen line sets `ff`, together with `line` and `overpen`, plus `pierce` when hot. The Ancient is skipped, as are allies behind the muzzle.
- Statuses: Suppressed (−40% speed for 3 s), Marked (+25%, consumed), Exposed (−5 armour for 3 s), Clumped (+30% from area hits for 2 s), Taunted and Rooted. A status doesn't stack; the largest value wins.
  - Nothing applies Exposed yet.
  - The stand-ins apply the others: the tank taunts, the ranged marks, and the support heals and pulls (Clumped).
- Intents board: one hero posts, others reserve with an offset of up to 5 s, and the board casts for them. It doesn't care about the intent kind and has no rule tying a kind to an ability (B-LNDY7YQ3SK4OCDAT). The Gunner ignores the autocast settings.
- Missing:
  - a hook that fires when damage is taken;
  - a way for a heal to refuse a target;
  - spawning in the middle of a match;
  - any resource besides Gunner heat;
  - anything on death except removal: the game ends only when the Ancient dies or the waves run out.

## 1. A status loop shared by all three heroes (pillar 2: a loop, not a chain)
1. The Gunner applies **Suppressed**, and the Psyker cashes it in.
2. The Psyker applies **Clumped**, and the Penitent and the Gunner cash it in.
3. The Penitent applies **Exposed**, and the Gunner cashes it in with cold shots against Brutes.

## 2. Penitent (tank). Resource: Pain (the §4 concept; B approves the rules)

### P1 · "The Scourged": Pain banked from wounds
Every blow he takes becomes stored wrath.
- **Pain** (0–1000) fills with the raw damage he takes. Friendly fire counts ×1.5. Pain drains 5%/s outside combat.
- **Passive, Wound-Zeal:** +0–60% damage, scaling with missing hp. Normal heals do 25% on him.
- **Q · Chain of Penance:** taunts enemies within 8 for 3 s and applies Exposed. 9 s cooldown.
- **W · Scourge:** spends all Pain on a radius-6 `splash` for Pain × 0.4. 6 s cooldown.
- **E · Mortify:** costs 12% of current hp; gives +150 Pain and +4 armour for 4 s. 12 s cooldown.
- **R · Martyrdom:** lasts 6 s and taunts everything within 10. He loses half the hp, but Pain banks the full raw damage. At the end, a nova releases Pain × 0.5 as `splash`, radius 7. 90 s cooldown. Afterwards he is Spent for 6 s: Pain locked at 0, −4 armour, no taunt.
- **Pillars:**
  - Pillar 1: he gets stronger at low hp, so the cost lands on survival, a different axis from damage. Spending on W now or saving for R is a situational choice, and the Gunner's friendly fire becomes fuel the team has to negotiate.
  - Pillar 2: Exposed is his setup and Clumped is his cash-in.
- **Combo:** with Furnace Heart forcing pierce, about 64 dps of friendly fire becomes about 96 Pain/s. Over 6 s that adds up to roughly 1050 Pain, so the nova does about 525 per target, or about 680 against Clumped targets.
- **Engine work:**
  - a damage-taken hook in `dealDamage`;
  - a heal multiplier per target;
  - a Pain resource with bands;
  - the kit, plus a bot for it;
  - perception for "stand in the Gunner's line".
- **Risks:**
  - The early lull starves Pain.
  - Wound-Zeal can turn into a duty rather than a choice.
  - The Gunner's friendly fire can kill him during the wombo. An hp floor knob would control this.

### P2 · "The Flagellant": hp is the currency
He bleeds himself to buy power.
- Every ability costs hp. Pain is the hp he has sacrificed, and it refunds at 2%/s unless spent.
- **Q · Lash:** 8% hp. Taunts and applies Exposed.
- **W · Penance Strike:** 6% hp. A cone hit for 40 + 0.3 × Pain.
- **E · Scab:** converts all Pain back into hp, then no abilities for 4 s.
- **R · Martyrdom:** like P1, but it scales on Pain sacrificed plus damage taken.
- **Weak spots:**
  - Friendly-fire synergy is weaker.
  - Bots that misjudge hp costs die first, which makes the wipe cascade worse.

### P3 · "The Intercessor": he takes on the team's wounds
- **Q · Vow:** tethers one ally for 6 s. Half of that ally's damage goes to him and becomes Pain.
- **R · Martyrdom:** tethers every ally within 10 and taunts every enemy within 10.
- ⚑ The tether is a new mechanic.
- **Strengths:** the cost falls on a teammate's choice, and it directly answers the 15–25 s wipes.
- **Weak spots:**
  - He no longer has the stand-in-the-Gunner's-fire fantasy.
  - Damage redirection muddies the reporter's attribution.
  - His death can still cascade.

## 3. Psyker. Resource: Warp (the §4 concept; B approves the rules)

### Y1 · "Warp Gambler": a visible chance of backlash
The more he draws on the Warp, the stronger he gets and the less control he has.
- **Warp** (0–100) rises as he casts and decays at 4/s while he doesn't. He gets +1% spell power per point.
- **Backlash** chance per cast is max(0, Warp − 50) × 1.2%. The chance is always shown, and it rolls on a seeded named RNG stream.
  - **Discharge:** (60 + Warp) damage as `ff` and `splash` in radius 4 around himself.
  - **Rift:** spawns enemies. Defer it until after M2, because it touches wave-end semantics.
- **Q · Warp Lance:** a line of 11, 60 dmg, ×1.5 against Suppressed. +10 Warp, 4 s cooldown.
- **W · Gravitic Lash:** pulls enemies within (5 + 2w) toward a point by up to (4 + 3w), then applies Clumped of (0.3 + 0.2w) for 2 s. +20 Warp, 10 s cooldown. Here w = Warp/100.
- **E · Quell:** a 1.5 s channel, rooted, for −50 Warp.
- **R · Event Horizon:** a 1.2 s windup, then a radius-9 pull with Clumped and Rooted for 1.5 s. +40 Warp, 100 s cooldown. Afterwards Quell is locked for 8 s, and no roll happens during the ultimate itself.
- **Pillars:**
  - Pillar 1: high Warp trades ally safety for power, and Quell is a way to decline at the cost of mobility.
  - Pillar 2: Suppressed is his cash-in and Clumped is his setup.
- **Intents:** the Lash posts a dedicated `pull` intent. The Penitent reserves at about +0.3 s and the Gunner at about +0.5 s. The intent must fire later than their reaction delay (L-KQN4NFNYHTDB6VAL).
- **Engine work:**
  - a Warp resource;
  - a sim RNG stream for the kit;
  - `ff` on backlash damage;
  - a pull that scales with Warp.

### Y2 · "The Vessel": a hard threshold, no roll
- Crossing 100 Warp guarantees a backlash on the next cast, and he aims where it lands. The cost is fully visible, so bots can score it.
- Aiming the backlash onto the Penitent during Martyrdom deliberately feeds Pain.
- **Risks:**
  - It departs from §4's "rising chance".
  - It can collapse into a rotation, which makes it a tax.

### Y3 · "The Conduit": Warp lent to allies
- **E · Empower:** an ally gets +30% damage for 5 s and carries 30 Warp, and can backlash themselves.
- ⚑ Warp per ally is effectively a new resource.
- **Strengths:** strong co-op negotiation. Empowering the Gunner pushes her toward redline sooner, and Warp given to the Penitent converts to Pain.
- **Risks:**
  - The most engine work: Warp on every hero, plus HUD and perception.
  - It muddies "each hero has a unique resource".

## 4. Gunner third ability (slot 2)
- **G1 · Keep Suppressing Fire** (live today). With the §1 loop it becomes a real setup. It costs heat-time spent on a cone that doesn't kill. No engine work. Until the loop exists, Suppressed only slows enemies, so the payoff is weak.
- **G2 · Redline Surge.** Instantly +30% heat and full spin, 14 s cooldown. It buys time to reach power at the cost of ally safety and overheat risk, and reserving it against a pull gives a mini-wombo. It overlaps Furnace Heart, and it removes the loop's source of Suppressed.
- **G3 · Pavise.** A 3-wide barrier within range 6 that lasts 8 s. Her overpen line stops at it, so neither friendly fire nor enemy hits get past. 16 s cooldown. Trading reach for the tank's safety makes it a negotiation tool. It needs a prop entity and a `fireLine` clip, and it can become a tax.

## 5. Friendly-fire scope (§10 Q1)
- **F1 · Gunner overpen only (today).** No work and easy for bots to read. But then Martyrdom only fuels from the Gunner, and the Psyker has no cost to allies.
- **F2 · Opt-in per kit.** Each damage source chooses `ff`: Gunner overpen, Psyker backlash, and optionally the Penitent's nova. It matches the interim rule in §3, and the code already works this way. B judges each new source.
- **F3 · All `line`/`cone`/`splash`.** The most co-op negotiation, but:
  - every cone taxes allies;
  - bots need positional costs everywhere;
  - it reads poorly on mobile;
  - friendly-fire metrics swamp the reports.

## 6. Playtest observations from wave 2
- **About 100 s of lull** (waves 1–5 are harmless). This needs wave or Director tuning, but it also starves Pain and Warp. Options: compress the early waves, lower `firstDelay`/`interval`, or let early sends bring later waves forward.
- **The team wipes within 15–25 s.** Options: P3's tether, a Penitent "last breath" (3 s of not dying, spending Pain), or a respawn timer.
- **Victory with heroes dead.** This is the death question (Q12).

## 7. Recommendation (lead)
- **Penitent:** P1.
- **Psyker:** Y1 without Rift for M2.
- **Gunner slot 2:** G1. Revisit G2 if the reporter shows Suppress drifting toward always-or-never.
- **Friendly fire:** F2 (Gunner overpen plus Psyker backlash).
- **Death:** respawn at the next wave start with a scar (wave 9), and a team wipe loses the game.

## 8. Questions for B (one line each)
1. Penitent: P1, P2 or P3?
- P1
2. Pain as "damage taken, friendly fire ×1.5, heals 25% on him": acceptable?
- Yes
3. Martyrdom: can the Gunner's friendly fire kill him, or does he have a 1 hp floor?
- 1 HP floor
4. Psyker: Y1, Y2 or Y3? (Y3 adds per-ally Warp.)
- Y1
5. Defer Rift backlash (enemy spawns) until after M2?
- Yes
6. Gunner slot 2: Suppressing Fire, Redline Surge or Pavise?
- Pavise
7. Adopt the status loop: Suppressed → Psyker, Clumped → Penitent, Exposed → Gunner?
- Yes
8. Friendly-fire scope: F1, F2 or F3?
- F2
9. Status numbers (Marked +25% consumed, Exposed −5 for 3 s, Clumped +30% for 2 s, Suppressed −40% for 3 s): keep, retune or replace?
- Keep
10. Can bargains hurt or heal the Ancient (today it takes only leak damage)?
- Heal, not hurt
11. Leash: aggro-on-damage, or raise LEASH_RANGE (the effective leash is about 6–8, against 10)?
- raise
12. Hero death: removal, a respawn timer, or respawn at the next wave with a scar? And does a team wipe lose the game?
- Timer based on which wave
13. Early lull: compress waves 1–5, or shorten the 20 s interval?
- Allow call early any level, mutators later may increase wave count drastically
14. M2 kits: the full 3 abilities plus ultimate, or a reduced kit (pull, taunt, Martyrdom) first?
- Reduced kit first
