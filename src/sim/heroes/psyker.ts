// Psyker "Warp Gambler" kit (D-4TKP7DQRMLBK6K7W). Owner: slice B (w8).
// Every field added to PsykerState MUST be added to hashPsyker (L-53OTZPIIVO2XYNNL).
//
// Model:
// - Warp runs 0..warp.max. A basic-attack hit adds warp.perHit; a Lash cast adds lash.warpGain.
//   It decays at warp.decayPerSecond except for warp.decayDelay seconds after a cast.
// - Spell power is +warp.powerPerPoint per Warp point. Lash reads it as w = Warp / max (radius,
//   pull distance and Clumped scale with it); Discharge as baseDamage + Warp. Both take Warp
//   BEFORE the cast's own Warp gain.
// - Every successful Lash rolls the backlash once: chance = max(0, Warp - freeBelow) * chancePerPoint,
//   on the kit stream only (`kit.rng`, derived at spawn from the game seed and the hero's entity id
//   and HASHED here, so the roll is replayable and never touches the sim stream `ctx.rng`). One
//   draw per cast, whatever the chance. The only outcome is Discharge: (baseDamage + Warp) `ff`
//   `splash` damage within backlash.radius of him after the pull, plus a `backlash` event.
// - A Lash with no valid point (out of range) or no enemy in the pull radius is refused and costs nothing.
// - Autocast is not honoured (bots own it); the mask is only stored.
// Warp surfaces through perception as a ResourceView plus a second one named `backlash`
// (src/perception/kits/psyker.ts).

import type { PsykerDef } from '../../content/heroes/psyker.ts';
import type { Point } from '../../content/types.ts';
import { nextFloat, type Rng } from '../../detmath/index.ts';
import { dealDamage } from '../combat.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { nearestHostile, unitsInRadius } from '../query.ts';
import { applyStatus } from '../statuses.ts';
import { perTick, ticks } from '../time.ts';

export interface PsykerState extends KitBase {
  readonly kind: 'psyker';
  /** The kit's own stream (see the file header). */
  readonly rng: Rng;
  /** 0..def.warp.max. */
  warp: number;
  /** Last emitted Warp band (`resource` event). */
  warpBand: number;
  cdLash: number;
  /** Ticks left in which Warp does not decay (set by a cast). */
  decayHold: number;
}

export function initPsyker(_def: PsykerDef, rng: Rng): PsykerState {
  return {
    kind: 'psyker',
    hold: false,
    autocast: 0,
    respawnAt: 0,
    rng,
    warp: 0,
    warpBand: 0,
    cdLash: 0,
    decayHold: 0,
  };
}

/** Everything a kit function needs about one hero. */
export interface PsykerRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: PsykerState;
  readonly def: PsykerDef;
}

type AbilityCmd = Extract<HeroCommand, { kind: 'ability' }>;

/** Chance (0..1) that a cast at `warp` backlashes. */
export function backlashChance(def: PsykerDef, warp: number): number {
  return Math.max(0, warp - def.backlash.freeBelow) * def.backlash.chancePerPoint;
}

/** Warp bands for `resource` events: 0, above the free zone, above the midpoint of the rest, and full. */
function bandOf(run: PsykerRun): number {
  const { kit, def } = run;
  if (kit.warp >= def.warp.max) {
    return 100;
  }
  if (kit.warp > (def.warp.max + def.backlash.freeBelow) / 2) {
    return 75;
  }
  return kit.warp > def.backlash.freeBelow ? 50 : 0;
}

function syncBand(run: PsykerRun): void {
  const band = bandOf(run);
  if (band !== run.kit.warpBand) {
    run.kit.warpBand = band;
    run.ctx.emit({ tick: run.ctx.tick, kind: 'resource', hero: run.hero.id, resource: 'warp', band });
  }
}

function addWarp(run: PsykerRun, amount: number): void {
  const { kit, def } = run;
  kit.warp = Math.min(def.warp.max, Math.max(0, kit.warp + amount));
}

function attack(run: PsykerRun): void {
  const { ctx, hero, kit, def } = run;
  if (hero.attack.cooldown > 0) {
    hero.attack.cooldown -= 1;
    return;
  }
  const target = kit.hold ? undefined : nearestHostile(ctx.entities, hero, def.attack.range);
  hero.attack.target = target?.id ?? 0;
  if (target === undefined) {
    return;
  }
  // Ranged: no `melee` tag, so the client draws a tracer.
  const dealt = dealDamage(ctx, { src: hero.id, dst: target.id, amount: def.attack.damage, tags: [] });
  if (dealt > 0) {
    addWarp(run, def.warp.perHit);
    hero.attack.cooldown = Math.max(0, ticks(def.attack.cooldown) - 1);
  }
}

export function tickPsyker(run: PsykerRun): void {
  const { kit, def } = run;
  attack(run);
  if (kit.decayHold > 0) {
    kit.decayHold -= 1;
  } else {
    addWarp(run, -perTick(def.warp.decayPerSecond));
  }
  syncBand(run);
  kit.cdLash = Math.max(0, kit.cdLash - 1);
}

// ---------------------------------------------------------------- Gravitic Lash

/** The point a Lash is aimed at: the command's x/y, else its target, else the nearest hostile; within range. */
function lashPoint(run: PsykerRun, cmd: AbilityCmd): Point | undefined {
  const { ctx, hero, def } = run;
  let point: Point | undefined;
  if (cmd.x !== undefined && cmd.y !== undefined) {
    point = { x: cmd.x, y: cmd.y };
  } else if (cmd.target !== undefined && cmd.target !== 0) {
    point = ctx.entities.get(cmd.target);
  } else {
    point = nearestHostile(ctx.entities, hero, def.lash.range);
  }
  if (point === undefined) {
    return undefined;
  }
  const dx = point.x - hero.x;
  const dy = point.y - hero.y;
  return dx * dx + dy * dy <= def.lash.range * def.lash.range ? { x: point.x, y: point.y } : undefined;
}

/** Rolls the backlash on the kit stream (one draw per cast) and, on a hit, discharges around him. */
function rollBacklash(run: PsykerRun, warp: number): void {
  const { ctx, hero, kit, def } = run;
  const roll = nextFloat(kit.rng);
  if (!(roll < backlashChance(def, warp))) {
    return;
  }
  const damage = def.backlash.baseDamage + warp;
  ctx.emit({ tick: ctx.tick, kind: 'backlash', hero: hero.id, warp, damage });
  for (const e of unitsInRadius(ctx.entities, hero, def.backlash.radius)) {
    dealDamage(ctx, { src: hero.id, dst: e.id, amount: damage, tags: ['ff', 'splash'] });
  }
}

function castLash(run: PsykerRun, cmd: AbilityCmd): void {
  const { ctx, hero, kit, def } = run;
  const { lash } = def;
  if (hero.hp <= 0 || kit.cdLash > 0) {
    return;
  }
  const point = lashPoint(run, cmd);
  if (point === undefined) {
    return;
  }
  const { warp } = kit;
  const w = warp / def.warp.max;
  const hit = unitsInRadius(ctx.entities, point, lash.radius + lash.radiusPerW * w, 1).filter(
    (e) => e.kind === 'enemy',
  );
  if (hit.length === 0) {
    return;
  }
  const pull = lash.distance + lash.distancePerW * w;
  for (const unit of hit) {
    const e = ctx.entities.get(unit.id);
    if (e === undefined) {
      continue;
    }
    const dx = point.x - e.x;
    const dy = point.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      const step = Math.min(pull, d);
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
    }
    applyStatus(ctx, e.id, {
      status: 'clumped',
      src: hero.id,
      durationTicks: Math.max(1, ticks(lash.clumpedSeconds)),
      value: lash.clumped + lash.clumpedPerW * w,
    });
  }
  kit.cdLash = ticks(lash.cooldown);
  kit.decayHold = ticks(def.warp.decayDelay);
  ctx.emit({ tick: ctx.tick, kind: 'ability', hero: hero.id, slot: 0, target: cmd.target ?? 0, value: hit.length });
  rollBacklash(run, warp);
  addWarp(run, lash.warpGain);
  syncBand(run);
}

/** Called after commandHero applied move / stop / hold / autocast; handles `ability`. */
export function commandPsyker(run: PsykerRun, cmd: HeroCommand): void {
  if (cmd.kind === 'ability' && cmd.slot === 0) {
    castLash(run, cmd);
  }
}

export function downPsyker(run: PsykerRun): void {
  const { kit } = run;
  kit.warp = 0;
  kit.cdLash = 0;
  kit.decayHold = 0;
  syncBand(run);
}

/** Hashes the kit's own fields (the RNG words included); hold, autocast and respawnAt are hashed by the dispatcher. */
export function hashPsyker(h: StateHasher, kit: PsykerState): void {
  for (const w of kit.rng.state) {
    h.u32(w);
  }
  h.f64(kit.warp).u32(kit.warpBand).u32(kit.cdLash).u32(kit.decayHold);
}
