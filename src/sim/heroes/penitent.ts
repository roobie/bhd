// Penitent "The Scourged" kit (D-IL3SV332IUGDBPFW, reduced kit D-ZQ7UANKFTPZIMMZW). Owner: slice A (w8).
// - Basic attack: melee, damage scaled by Wound-Zeal (+0..maxBonus with missing hp). The nova scales too.
// - Pain 0..pain.max: banks the raw damage he takes (friendly fire x friendlyFireMult). After
//   drainDelaySeconds without damage it drains drainPerSecond of max per second. Not drained during Martyrdom.
// - Chain of Penance (slot 0): taunts and Exposes enemies within radius. Refused when Spent or with no enemy in reach.
// - Martyrdom (slot 3): for `seconds` taunts everything within tauntRadius (refreshed every tick), takes
//   hpLossMult of the hit as hp loss while Pain banks the full raw damage, and friendly fire cannot take him
//   below 1 hp. At the end a `splash` nova of Pain x novaPainMult hits enemies in novaRadius (allies too only
//   with `novaHitsAllies`, tagged `ff`), Pain goes to 0, and he is Spent for spentSeconds: Pain locked at 0,
//   armour reduced, no Chain.
// Counters are whole ticks. Armour is restored from the def when Spent ends or he goes down.
// Every field added to PenitentState MUST be added to hashPenitent (L-53OTZPIIVO2XYNNL).
//
// Hooks the kit gets from the engine (heroes/index.ts routes them here):
// - damageTakenPenitent: Pain banks `hit.raw`; Martyrdom halves the hp loss and sets `minHp: 1`.
// - healTakenPenitent: heals do def.pain.healMult (x0.25).
// - downPenitent: called when he goes down; Pain resets.
// Pain surfaces through perception as a ResourceView (src/perception/kits/penitent.ts).

import type { PenitentDef } from '../../content/heroes/penitent.ts';
import { dealDamage } from '../combat.ts';
import type { HeroCommand } from '../commands.ts';
import type { DamageTakenInput, DamageTakenResult, TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { nearestHostile, unitsInRadius } from '../query.ts';
import { applyStatus } from '../statuses.ts';
import { ticks } from '../time.ts';

export interface PenitentState extends KitBase {
  readonly kind: 'penitent';
  /** 0..def.pain.max. */
  pain: number;
  /** Last emitted Pain band (`resource` event). */
  painBand: number;
  /** Ticks since he last took damage (the Pain drain waits for def.pain.drainDelaySeconds). */
  calmTicks: number;
  cdChain: number;
  cdMartyrdom: number;
  /** Ticks of Martyrdom left (0 = not active). */
  martyrdomTicks: number;
  /** Ticks of Spent left (Pain locked at 0; 0 = not spent). */
  spentTicks: number;
}

export function initPenitent(_def: PenitentDef): PenitentState {
  return {
    kind: 'penitent',
    hold: false,
    autocast: 0,
    respawnAt: 0,
    pain: 0,
    painBand: 0,
    calmTicks: 0,
    cdChain: 0,
    cdMartyrdom: 0,
    martyrdomTicks: 0,
    spentTicks: 0,
  };
}

/** Everything a kit function needs about one hero. */
export interface PenitentRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: PenitentState;
  readonly def: PenitentDef;
}

type Unit = Readonly<Entity>;

/** Pain bands for the `resource` event: 0, 25, 50, 75, 100 (percent of max). */
function painBandOf(run: PenitentRun): number {
  const frac = run.def.pain.max > 0 ? run.kit.pain / run.def.pain.max : 0;
  return Math.min(100, Math.floor(frac * 4) * 25);
}

function syncBand(run: PenitentRun): void {
  const band = painBandOf(run);
  if (band !== run.kit.painBand) {
    run.kit.painBand = band;
    run.ctx.emit({ tick: run.ctx.tick, kind: 'resource', hero: run.hero.id, resource: 'pain', band });
  }
}

/** Wound-Zeal: 1 + maxBonus x missing hp fraction. */
function zeal(run: PenitentRun): number {
  const { hero, def } = run;
  const missing = hero.maxHp > 0 ? Math.min(1, Math.max(0, 1 - hero.hp / hero.maxHp)) : 0;
  return 1 + def.zeal.maxBonus * missing;
}

function enemiesIn(run: PenitentRun, radius: number): Unit[] {
  const { ctx, hero } = run;
  return unitsInRadius(ctx.entities, hero, radius, 1).filter((e) => e.kind === 'enemy');
}

function ability(run: PenitentRun, slot: number, value: number): void {
  run.ctx.emit({ tick: run.ctx.tick, kind: 'ability', hero: run.hero.id, slot, target: 0, value });
}

function taunt(run: PenitentRun, enemies: readonly Unit[], durationTicks: number): void {
  for (const e of enemies) {
    applyStatus(run.ctx, e.id, { status: 'taunted', src: run.hero.id, durationTicks, value: 0 });
  }
}

function castChain(run: PenitentRun): void {
  const { ctx, hero, kit, def } = run;
  if (kit.cdChain > 0 || kit.spentTicks > 0) {
    return;
  }
  const hit = enemiesIn(run, def.chain.radius);
  if (hit.length === 0) {
    return;
  }
  taunt(run, hit, Math.max(1, ticks(def.chain.tauntSeconds)));
  for (const e of hit) {
    applyStatus(ctx, e.id, {
      status: 'exposed',
      src: hero.id,
      durationTicks: Math.max(1, ticks(def.chain.exposedSeconds)),
      value: def.chain.exposedValue,
    });
  }
  kit.cdChain = ticks(def.chain.cooldown);
  ability(run, 0, hit.length);
}

function castMartyrdom(run: PenitentRun): void {
  const { kit, def } = run;
  if (kit.cdMartyrdom > 0 || kit.martyrdomTicks > 0 || kit.spentTicks > 0) {
    return;
  }
  kit.martyrdomTicks = Math.max(1, ticks(def.martyrdom.seconds));
  kit.cdMartyrdom = ticks(def.martyrdom.cooldown);
  taunt(run, enemiesIn(run, def.martyrdom.tauntRadius), TAUNT_REFRESH_TICKS);
  ability(run, 3, def.martyrdom.seconds);
}

/** Martyrdom's taunt is refreshed every tick with this short lifetime, so it ends with the stance. */
const TAUNT_REFRESH_TICKS = 2;

/** Martyrdom's end: the nova, then Spent (Pain 0, less armour). */
function endMartyrdom(run: PenitentRun): void {
  const { ctx, hero, kit, def } = run;
  const m = def.martyrdom;
  const amount = kit.pain * m.novaPainMult * zeal(run);
  if (amount > 0) {
    const victims = unitsInRadius(ctx.entities, hero, m.novaRadius).filter(
      (e) => e.id !== hero.id && (e.team !== hero.team || (m.novaHitsAllies && e.kind === 'hero')),
    );
    for (const e of victims) {
      const tags = e.team === hero.team ? ['splash', 'ff', 'ability:martyrdom'] : ['splash', 'ability:martyrdom'];
      dealDamage(ctx, { src: hero.id, dst: e.id, amount, tags });
    }
  }
  kit.pain = 0;
  kit.spentTicks = Math.max(1, ticks(m.spentSeconds));
  hero.armour = Math.max(0, def.armour - m.spentArmourPenalty);
}

function basicAttack(run: PenitentRun): void {
  const { ctx, hero, kit, def } = run;
  if (hero.attack.cooldown > 0) {
    hero.attack.cooldown -= 1;
    return;
  }
  const target = kit.hold ? undefined : nearestHostile(ctx.entities, hero, def.attack.range);
  hero.attack.target = target?.id ?? 0;
  if (target !== undefined) {
    const dealt = dealDamage(ctx, {
      src: hero.id,
      dst: target.id,
      amount: def.attack.damage * zeal(run),
      tags: ['melee'],
    });
    if (dealt > 0) {
      // Counts down to 0 and fires on the next tick, so swings land exactly ticks(cooldown) apart.
      hero.attack.cooldown = Math.max(0, ticks(def.attack.cooldown) - 1);
    }
  }
}

/** The Pain and Martyrdom / Spent timers for this tick. */
function tickStates(run: PenitentRun): void {
  const { hero, kit, def } = run;
  kit.calmTicks += 1;
  if (kit.martyrdomTicks > 0) {
    taunt(run, enemiesIn(run, def.martyrdom.tauntRadius), TAUNT_REFRESH_TICKS);
    kit.martyrdomTicks -= 1;
    if (kit.martyrdomTicks === 0) {
      endMartyrdom(run);
    }
  } else if (kit.spentTicks > 0) {
    kit.pain = 0;
    kit.spentTicks -= 1;
    if (kit.spentTicks === 0) {
      hero.armour = def.armour;
    }
  } else if (kit.calmTicks >= ticks(def.pain.drainDelaySeconds)) {
    kit.pain = Math.max(0, kit.pain - (def.pain.max * def.pain.drainPerSecond) / ticks(1));
  }
}

export function tickPenitent(run: PenitentRun): void {
  const { hero, kit } = run;
  tickStates(run);
  if (hero.hp > 0) {
    basicAttack(run);
  }
  kit.cdChain = Math.max(0, kit.cdChain - 1);
  kit.cdMartyrdom = Math.max(0, kit.cdMartyrdom - 1);
  syncBand(run);
}

/** Called after commandHero applied move / stop / hold / autocast; handles `ability`. */
export function commandPenitent(run: PenitentRun, cmd: HeroCommand): void {
  if (cmd.kind !== 'ability') {
    return;
  }
  if (cmd.slot === 0) {
    castChain(run);
  } else if (cmd.slot === 3) {
    castMartyrdom(run);
  }
}

export function damageTakenPenitent(run: PenitentRun, hit: DamageTakenInput): DamageTakenResult {
  const { ctx, kit, def } = run;
  const attacker = ctx.entities.get(hit.spec.src);
  const friendly = attacker !== undefined && attacker.team === hit.victim.team && hit.spec.tags.includes('ff');
  kit.calmTicks = 0;
  if (kit.spentTicks === 0) {
    const banked = hit.raw * (friendly ? def.pain.friendlyFireMult : 1);
    kit.pain = Math.min(def.pain.max, kit.pain + banked);
  }
  if (kit.martyrdomTicks > 0) {
    return { amount: hit.raw * def.martyrdom.hpLossMult, minHp: 1 };
  }
  return { amount: hit.amount, minHp: 0 };
}

export function healTakenPenitent(run: PenitentRun, amount: number): number {
  return amount * run.def.pain.healMult;
}

/** Going down resets Pain and every timed state (cooldowns keep running). */
export function downPenitent(run: PenitentRun): void {
  const { hero, kit, def } = run;
  kit.pain = 0;
  kit.calmTicks = 0;
  kit.martyrdomTicks = 0;
  kit.spentTicks = 0;
  hero.armour = def.armour;
  syncBand(run);
}

/** Hashes the kit's own fields; hold, autocast and respawnAt are hashed by the dispatcher. */
export function hashPenitent(h: StateHasher, kit: PenitentState): void {
  h.f64(kit.pain).u32(kit.painBand).u32(kit.calmTicks).u32(kit.cdChain).u32(kit.cdMartyrdom);
  h.u32(kit.martyrdomTicks).u32(kit.spentTicks);
}
