// Gunner "The Furnace" kit (project DESIGN.md §4.1). Owner: gunner.
// Every field added to GunnerState MUST be added to hashGunner (L-53OTZPIIVO2XYNNL).
//
// Model (counters are integer ticks; spin is a float fraction 0..1; heat is an INTEGER in basis
// points 0..10000, so thresholds are exact; the shot timer is an integer in 1/1024 tick):
// - Firing: each tick the hero picks a target (nearest hostile in range; when braced, nearest inside
//   the brace arc and the braced range). Not on hold, not unbracing, not locked out. A shot fires
//   when the shot timer is <= 0 and adds period = ticks(attack.cooldown) / rate (rounded to 1/1024
//   tick) to it; the sub-tick remainder carries over, so shots are exactly `period` ticks apart at a
//   constant rate. With nothing to shoot at the timer rests at 0 (no banked credit), so re-engaging
//   fires at once. `hero.attack.cooldown` mirrors the timer in whole ticks (rounded up).
// - Spin: while a target exists, spin grows over spin.rampSeconds, or drains over
//   spin.movingDrainSeconds when the hero actually moved since last tick (position compared with
//   the one stored in kit state; never while braced). With no target it drains over
//   spin.idleDrainSeconds unless braced (braced spin never decays). Rate = lerp(min, max, spin).
// - Heat: + heat.perShot per shot. It decays (heat.decayPerSecond) only when NOT engaged (no
//   target). Bands are 0 / 60 / 85 / 100; a `resource` event (resource 'heat') is emitted when the
//   band changes, in either direction (a jump over several bands is one event for the new band).
//   > pierceAbove: shots carry `pierce`. > overpenAbove: shots are a line (unitsOnSegment) with tags
//   ff+line+overpen(+pierce) hitting everything but the shooter and the Ancient. At 100%: overheat,
//   no fire for heat.overheatSeconds exactly, heat bleeds linearly to 0, spin resets to 0.
// - Brace (slot 0, toggle): rooted status + move stopped, +range, fixed arc centred on the facing
//   at brace time (or the aimed x/y). Unbrace: rooted and NOT firing for brace.unbraceSeconds.
//   While braced, ability cones always aim along the brace facing.
// - Vent, Pavise and Furnace Heart are refused while locked out (overheat / forced vent); Brace always works.
//   Autocast is NOT honoured here (bots, wave 3, own that): the mask is only stored.
// - Facing is kit state (entities have none): toward the current target, else toward the move target.
// - Ability cooldowns and the unbrace/furnace timers count down at the END of the tick, so a
//   cooldown of n ticks cast on tick T is ready on tick T + n.

import type { GunnerDef } from '../../content/heroes/gunner.ts';
import { angleDiff, atan2, cos, PI, sin } from '../../detmath/index.ts';
import { dealDamage } from '../combat.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { spawnProp } from '../props.ts';
import { firstBarrier, nearestHostile, unitsInRadius, unitsOnSegment } from '../query.ts';
import { applyStatus, removeStatus } from '../statuses.ts';
import { ticks } from '../time.ts';

/** Brace stance codes (hashed as numbers). */
export const STANCE = { free: 0, braced: 1, unbracing: 2 } as const;

/** Heat is stored in basis points: 10000 = 100%. Content authors fractions; `bp` converts. */
const HEAT_FULL = 10_000;
/** The shot timer counts in 1/SUB tick. */
const SUB = 1024;

function bp(fraction: number): number {
  return Math.round(fraction * HEAT_FULL);
}

export interface GunnerState extends KitBase {
  readonly kind: 'gunner';
  /** 0..1. */
  spin: number;
  /** Basis points, 0..10000. */
  heat: number;
  /** Last emitted heat band: 0, 60, 85 or 100. */
  heatBand: number;
  /** STANCE code. */
  stance: number;
  /** Centre of the brace arc (radians). */
  braceFacing: number;
  /** Where she last aimed (radians). */
  facing: number;
  unbraceTicks: number;
  /** Ticks of no-fire left (overheat or forced vent). */
  lockTicks: number;
  /** Sub-ticks (1/1024 tick) until the next shot is allowed. */
  shot: number;
  /** Position at the last tick, to tell whether the hero actually moved. */
  lastX: number;
  lastY: number;
  /** Heat (basis points) shed per locked tick. */
  ventStep: number;
  /** Ticks of Furnace Heart left. */
  furnaceTicks: number;
  cdVent: number;
  cdPavise: number;
  cdFurnace: number;
}

export function initGunner(_def: GunnerDef, x = 0, y = 0): GunnerState {
  return {
    kind: 'gunner',
    hold: false,
    autocast: 0,
    respawnAt: 0,
    spin: 0,
    heat: 0,
    heatBand: 0,
    stance: STANCE.free,
    braceFacing: 0,
    facing: 0,
    unbraceTicks: 0,
    lockTicks: 0,
    ventStep: 0,
    shot: 0,
    lastX: x,
    lastY: y,
    furnaceTicks: 0,
    cdVent: 0,
    cdPavise: 0,
    cdFurnace: 0,
  };
}

/** Everything a kit function needs about one hero. */
interface GunnerRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: GunnerState;
  readonly def: GunnerDef;
}

type AbilityCmd = Extract<HeroCommand, { kind: 'ability' }>;
type Unit = Readonly<Entity>;

// ---------------------------------------------------------------- helpers

function angleTo(from: { readonly x: number; readonly y: number }, x: number, y: number): number {
  return atan2(y - from.y, x - from.x);
}

function degToRad(deg: number): number {
  return (deg * PI) / 180;
}

function heatBandOf(run: GunnerRun): number {
  const { kit, def } = run;
  if (kit.heat >= HEAT_FULL) {
    return 100;
  }
  if (kit.heat > bp(def.heat.overpenAbove)) {
    return 85;
  }
  return kit.heat > bp(def.heat.pierceAbove) ? 60 : 0;
}

/** Emits a `resource` event if the heat band changed. */
function syncBand(run: GunnerRun): void {
  const band = heatBandOf(run);
  if (band !== run.kit.heatBand) {
    run.kit.heatBand = band;
    run.ctx.emit({ tick: run.ctx.tick, kind: 'resource', hero: run.hero.id, resource: 'heat', band });
  }
}

function effectiveRange(run: GunnerRun): number {
  const { kit, def } = run;
  return def.attack.range * (kit.stance === STANCE.braced ? 1 + def.brace.rangeBonus : 1);
}

/** Starts a no-fire lock of `n` ticks: heat bleeds to 0 across it, spin resets. */
function startLock(run: GunnerRun, seconds: number): void {
  const { kit, hero } = run;
  const n = Math.max(1, ticks(seconds));
  kit.lockTicks = n;
  kit.ventStep = Math.ceil(kit.heat / n);
  kit.spin = 0;
  hero.attack.target = 0;
}

/** Adds `amount` basis points of heat. */
function addHeat(run: GunnerRun, amount: number): void {
  const { kit } = run;
  kit.heat = Math.min(HEAT_FULL, kit.heat + amount);
  if (kit.heat >= HEAT_FULL && kit.furnaceTicks === 0 && kit.lockTicks === 0) {
    startLock(run, run.def.heat.overheatSeconds);
  }
}

function ability(run: GunnerRun, slot: number, target: number, value: number): void {
  run.ctx.emit({ tick: run.ctx.tick, kind: 'ability', hero: run.hero.id, slot, target, value });
}

// ---------------------------------------------------------------- firing

function pickTarget(run: GunnerRun): Unit | undefined {
  const { ctx, hero, kit, def } = run;
  const range = effectiveRange(run);
  if (kit.stance !== STANCE.braced) {
    return nearestHostile(ctx.entities, hero, range);
  }
  const half = degToRad(def.brace.arcDegrees) / 2;
  let best: Unit | undefined;
  let bestD2 = 0;
  for (const e of unitsInRadius(ctx.entities, hero, range, 1)) {
    if (Math.abs(angleDiff(kit.braceFacing, angleTo(hero, e.x, e.y))) > half) {
      continue;
    }
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    const d2 = dx * dx + dy * dy;
    if (best === undefined || d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

/** `{dst}` when there is one, else nothing (the `block` event leaves `dst` out rather than set it undefined). */
function optDst(dst: number | undefined): { dst?: number } {
  return dst === undefined ? {} : { dst };
}

function fireLine(run: GunnerRun, target: Unit, tags: readonly string[]): void {
  const { ctx, hero, kit, def } = run;
  const dx = target.x - hero.x;
  const dy = target.y - hero.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const range = effectiveRange(run);
  const ux = d === 0 ? 1 : dx / d;
  const uy = d === 0 ? 0 : dy / d;
  // The line starts at the shooter's edge; hits behind that muzzle point (projection < 0) are skipped,
  // so allies overlapping her body are never hit.
  const from = { x: hero.x + ux * hero.radius, y: hero.y + uy * hero.radius };
  let to = { x: hero.x + ux * range, y: hero.y + uy * range };
  // A prop barrier (Pavise) stops the line: nothing past it is hit.
  const blocked = firstBarrier(ctx.entities, from, to);
  const full = to;
  if (blocked !== undefined) {
    to = { x: from.x + (to.x - from.x) * blocked.t, y: from.y + (to.y - from.y) * blocked.t };
    // The first unit the line would have hit behind the prop (muzzle-side hits are not "behind").
    const behind = unitsOnSegment(ctx.entities, from, full, def.heat.lineHalfWidth).find(
      (h) => h.t > blocked.t && h.unit.id !== hero.id && h.unit.kind !== 'ancient',
    );
    ctx.emit({ tick: ctx.tick, kind: 'block', src: hero.id, prop: blocked.prop, ...optDst(behind?.unit.id) });
  }
  kit.facing = angleTo(hero, target.x, target.y);
  for (const hit of unitsOnSegment(ctx.entities, from, to, def.heat.lineHalfWidth)) {
    if (hit.unit.id === hero.id || hit.unit.kind === 'ancient') {
      continue;
    }
    if ((hit.unit.x - from.x) * ux + (hit.unit.y - from.y) * uy < 0) {
      continue;
    }
    dealDamage(ctx, { src: hero.id, dst: hit.unit.id, amount: def.attack.damage, tags });
  }
}

function fire(run: GunnerRun, target: Unit): void {
  const { ctx, hero, kit, def } = run;
  const furnace = kit.furnaceTicks > 0;
  const pierce = furnace || kit.heat > bp(def.heat.pierceAbove);
  const overpen = furnace || kit.heat > bp(def.heat.overpenAbove);
  const pierceTags = pierce ? ['pierce'] : [];
  if (overpen) {
    fireLine(run, target, ['ff', 'line', 'overpen', ...pierceTags]);
  } else {
    dealDamage(ctx, { src: hero.id, dst: target.id, amount: def.attack.damage, tags: pierceTags });
  }
  const rate = def.spin.min + (def.spin.max - def.spin.min) * kit.spin;
  kit.shot += Math.round((ticks(def.attack.cooldown) * SUB) / rate);
  addHeat(run, bp(def.heat.perShot));
}

function updateSpin(run: GunnerRun, engaged: boolean, moving: boolean): void {
  const { kit, def } = run;
  const perTickOver = (seconds: number): number => 1 / Math.max(1, ticks(seconds));
  if (moving) {
    kit.spin = Math.max(0, kit.spin - perTickOver(def.spin.movingDrainSeconds));
  } else if (engaged) {
    kit.spin = Math.min(1, kit.spin + perTickOver(def.spin.rampSeconds));
  } else if (kit.stance !== STANCE.braced) {
    kit.spin = Math.max(0, kit.spin - perTickOver(def.spin.idleDrainSeconds));
  }
}

function tickLock(run: GunnerRun): void {
  const { kit, hero } = run;
  kit.lockTicks -= 1;
  kit.heat = kit.lockTicks === 0 ? 0 : Math.max(0, kit.heat - kit.ventStep);
  hero.attack.target = 0;
  syncBand(run);
}

function updateFacing(run: GunnerRun, target: Unit | undefined): void {
  const { hero, kit } = run;
  if (target !== undefined) {
    kit.facing = angleTo(hero, target.x, target.y);
  } else if (hero.move.mode === 'point') {
    kit.facing = angleTo(hero, hero.move.tx, hero.move.ty);
  }
}

function tickMain(run: GunnerRun): void {
  const { hero, kit, def } = run;
  // Moving = the position changed since last tick; a braced hero never counts (it is rooted).
  const moving = kit.stance !== STANCE.braced && (hero.x !== kit.lastX || hero.y !== kit.lastY);
  kit.lastX = hero.x;
  kit.lastY = hero.y;
  if (kit.shot > 0) {
    kit.shot -= SUB;
  }
  if (kit.lockTicks > 0) {
    tickLock(run);
    return;
  }
  const canFire = !kit.hold && kit.stance !== STANCE.unbracing;
  const target = canFire ? pickTarget(run) : undefined;
  hero.attack.target = target?.id ?? 0;
  updateFacing(run, target);
  if (target !== undefined && kit.shot <= 0) {
    fire(run, target);
  }
  if (kit.lockTicks > 0) {
    syncBand(run); // Overheated on this shot.
    return;
  }
  updateSpin(run, target !== undefined, moving);
  if (target === undefined) {
    const decay = Math.round(bp(def.heat.decayPerSecond) / ticks(1));
    kit.heat = Math.max(0, kit.heat - (decay > 0 ? Math.max(1, decay) : 0));
  }
  syncBand(run);
}

/** End-of-tick timers: ability cooldowns, unbracing, Furnace Heart's end (forced vent). */
function tickTimers(run: GunnerRun): void {
  const { kit, def } = run;
  kit.cdVent = Math.max(0, kit.cdVent - 1);
  kit.cdPavise = Math.max(0, kit.cdPavise - 1);
  kit.cdFurnace = Math.max(0, kit.cdFurnace - 1);
  if (kit.stance === STANCE.unbracing) {
    kit.unbraceTicks -= 1;
    if (kit.unbraceTicks <= 0) {
      kit.stance = STANCE.free;
    }
  }
  if (kit.furnaceTicks > 0) {
    kit.furnaceTicks -= 1;
    if (kit.furnaceTicks === 0) {
      startLock(run, def.furnace.ventSeconds);
      syncBand(run);
    }
  }
}

export function tickGunner(run: GunnerRun): void {
  const { hero, kit } = run;
  tickMain(run);
  if (kit.shot < 0) {
    kit.shot = 0; // The sub-tick carry only lives inside a firing tick: no banked credit while idle.
  }
  hero.attack.cooldown = Math.ceil(kit.shot / SUB);
  tickTimers(run);
}

// ---------------------------------------------------------------- abilities

/** Direction an ability aims: the command's x/y, else its target, else the facing; braced: the brace facing. */
function aimAngle(run: GunnerRun, cmd: AbilityCmd): number {
  const { ctx, hero, kit } = run;
  if (kit.stance === STANCE.braced) {
    return kit.braceFacing;
  }
  const target = cmd.target === undefined ? undefined : ctx.entities.get(cmd.target);
  if (cmd.x !== undefined && cmd.y !== undefined) {
    kit.facing = angleTo(hero, cmd.x, cmd.y);
  } else if (target !== undefined) {
    kit.facing = angleTo(hero, target.x, target.y);
  }
  return kit.facing;
}

/** Hostile units inside the cone (apex at the hero, `aim` direction, full width `coneDegrees`). */
function coneTargets(run: GunnerRun, aim: number, range: number, coneDegrees: number): Unit[] {
  const { ctx, hero } = run;
  const half = degToRad(coneDegrees) / 2;
  return unitsInRadius(ctx.entities, hero, range, 1).filter((e) => {
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    const body = hero.radius + e.radius;
    return dx * dx + dy * dy <= body * body || Math.abs(angleDiff(aim, atan2(dy, dx))) <= half;
  });
}

function castBrace(run: GunnerRun, cmd: AbilityCmd): void {
  const { ctx, hero, kit, def } = run;
  if (kit.stance === STANCE.free) {
    const facing = cmd.x !== undefined && cmd.y !== undefined ? angleTo(hero, cmd.x, cmd.y) : kit.facing;
    kit.stance = STANCE.braced;
    kit.braceFacing = facing;
    kit.facing = facing;
    hero.move.mode = 'idle';
    applyStatus(ctx, hero.id, {
      status: 'rooted',
      src: hero.id,
      durationTicks: ticks(def.brace.rootSeconds),
      value: 0,
    });
    ability(run, 0, 0, 1);
  } else if (kit.stance === STANCE.braced) {
    const n = Math.max(1, ticks(def.brace.unbraceSeconds));
    kit.stance = STANCE.unbracing;
    kit.unbraceTicks = n;
    removeStatus(ctx, hero.id, 'rooted', hero.id);
    applyStatus(ctx, hero.id, { status: 'rooted', src: hero.id, durationTicks: n, value: 0 });
    ability(run, 0, 0, 0);
  }
}

function castVent(run: GunnerRun, cmd: AbilityCmd): void {
  const { ctx, hero, kit, def } = run;
  if (kit.lockTicks > 0 || kit.cdVent > 0 || kit.heat <= 0) {
    return;
  }
  const dumped = kit.heat;
  const aim = aimAngle(run, cmd);
  ability(run, 1, cmd.target ?? 0, dumped / HEAT_FULL);
  for (const e of coneTargets(run, aim, def.vent.range, def.vent.coneDegrees)) {
    dealDamage(ctx, {
      src: hero.id,
      dst: e.id,
      amount: (dumped * def.vent.maxDamage) / HEAT_FULL,
      tags: ['cone', 'ability:vent'],
    });
  }
  kit.heat = 0;
  kit.spin = 0;
  kit.cdVent = ticks(def.vent.cooldown);
  syncBand(run);
}

/**
 * Pavise's aim as a unit vector plus how far away the aim point is (Infinity when there is no point).
 * The aim point is the command's x/y (also while braced), else its target, else the facing (braced: the
 * brace facing).
 */
function paviseAim(run: GunnerRun, cmd: AbilityCmd): { ux: number; uy: number; dist: number } {
  const { ctx, hero, kit } = run;
  const target = cmd.target === undefined ? undefined : ctx.entities.get(cmd.target);
  const at = cmd.x !== undefined && cmd.y !== undefined ? { x: cmd.x, y: cmd.y } : target;
  if (at !== undefined) {
    const dx = at.x - hero.x;
    const dy = at.y - hero.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      return { ux: dx / d, uy: dy / d, dist: d };
    }
  }
  const angle = kit.stance === STANCE.braced ? kit.braceFacing : kit.facing;
  return { ux: cos(angle), uy: sin(angle), dist: Number.POSITIVE_INFINITY };
}

/**
 * Pavise (slot 2): a targeted cast. The barrier stands `min(range, distance to the aim point)` away
 * along the Gunner->point direction, its long axis perpendicular to it (unit vector, no atan2).
 * Refused while locked out or on cooldown. Her own overpen line stops at it (`fireLine`), and so do
 * enemy melee hits across it (enemies.ts).
 */
function castPavise(run: GunnerRun, cmd: AbilityCmd): void {
  const { ctx, hero, kit, def } = run;
  if (kit.lockTicks > 0 || kit.cdPavise > 0) {
    return;
  }
  const { ux, uy, dist } = paviseAim(run, cmd);
  const reach = Math.min(def.pavise.range, dist);
  const prop = spawnProp(ctx, {
    def: 'pavise',
    owner: hero.id,
    x: hero.x + ux * reach,
    y: hero.y + uy * reach,
    ux: -uy,
    uy: ux,
    halfLength: def.pavise.halfLength,
    durationTicks: Math.max(1, ticks(def.pavise.seconds)),
  });
  if (prop === undefined) {
    return;
  }
  kit.cdPavise = ticks(def.pavise.cooldown);
  ability(run, 2, prop.id, def.pavise.seconds);
}

function castFurnace(run: GunnerRun): void {
  const { kit, def } = run;
  if (kit.lockTicks > 0 || kit.furnaceTicks > 0 || kit.cdFurnace > 0) {
    return;
  }
  kit.furnaceTicks = Math.max(1, ticks(def.furnace.activeSeconds));
  kit.cdFurnace = ticks(def.furnace.cooldown);
  ability(run, 3, 0, def.furnace.activeSeconds);
}

/** Called after commandHero applied move / stop / hold / autocast; handles `ability`. */
export function commandGunner(run: GunnerRun, cmd: HeroCommand): void {
  if (cmd.kind !== 'ability') {
    return;
  }
  switch (cmd.slot) {
    case 0:
      castBrace(run, cmd);
      return;
    case 1:
      castVent(run, cmd);
      return;
    case 2:
      castPavise(run, cmd);
      return;
    case 3:
      castFurnace(run);
      return;
    default:
  }
}

/** Going down (deaths system, once per down): back to a free stance with no lock, furnace or spin, and no heat. */
export function downGunner(run: GunnerRun): void {
  const { hero, kit } = run;
  kit.stance = STANCE.free;
  kit.unbraceTicks = 0;
  kit.lockTicks = 0;
  kit.ventStep = 0;
  kit.furnaceTicks = 0;
  kit.spin = 0;
  kit.heat = 0;
  kit.shot = 0;
  hero.attack.cooldown = 0;
  syncBand(run);
}

/** Revived at a new position: forget the old one so the first tick does not count as movement. */
export function respawnGunner(run: GunnerRun): void {
  run.kit.lastX = run.hero.x;
  run.kit.lastY = run.hero.y;
}

/** Hashes the kit's own fields; hold and autocast are hashed by the dispatcher. */
export function hashGunner(h: StateHasher, kit: GunnerState): void {
  h.f64(kit.spin).u32(kit.heat).u32(kit.heatBand).u32(kit.stance).f64(kit.braceFacing).f64(kit.facing);
  h.u32(kit.unbraceTicks).u32(kit.lockTicks).u32(kit.ventStep).u32(kit.furnaceTicks);
  h.u32(kit.shot).f64(kit.lastX).f64(kit.lastY);
  h.u32(kit.cdVent).u32(kit.cdPavise).u32(kit.cdFurnace);
}
