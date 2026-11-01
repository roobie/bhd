// Stand-in hero kits: PLACEHOLDERS (project DESIGN.md §7, wave 1d), no resources. Owner: stand-in-heroes.
// A basic attack plus generic abilities (taunt, mark, heal pulse, pull) with cooldowns in kit state.
// Every field added to StandinState MUST be added to hashStandin (L-53OTZPIIVO2XYNNL).
// Autocast (KitBase.autocast bit = slot): each tick, an off-cooldown ability with its bit set fires
// when it has a valid use (taunt: an enemy in radius; mark: a hostile in range; heal: a hurt hero in
// radius; pull: a hostile in range, pulling toward it).

import type { PullAbility, StandinAbilityDef, StandinDef } from '../../content/heroes/standins.ts';
import type { Point } from '../../content/types.ts';
import { dealDamage, heal } from '../combat.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { nearestHostile, unitsInRadius } from '../query.ts';
import { applyStatus } from '../statuses.ts';
import { ticks } from '../time.ts';

const SLOTS = 4;

export interface StandinState extends KitBase {
  readonly kind: 'standin';
  /** Ticks until each ability slot is ready (0 = ready). */
  cooldowns: number[];
}

export function initStandin(_def: StandinDef): StandinState {
  return { kind: 'standin', hold: false, autocast: 0, cooldowns: Array.from({ length: SLOTS }, () => 0) };
}

/** Everything a kit function needs about one hero. */
interface StandinRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: StandinState;
  readonly def: StandinDef;
}

/** Where/whom a cast is aimed. All optional; each ability picks what it needs. */
interface Aim {
  readonly x?: number;
  readonly y?: number;
  readonly target?: number;
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function enemiesInRadius(ctx: TickContext, center: Point, radius: number): Readonly<Entity>[] {
  return unitsInRadius(ctx.entities, center, radius, 1).filter((e) => e.kind === 'enemy');
}

/** The hostile to mark: the named target if live, hostile and in reach, else (no target named) the nearest. */
function markTarget(run: StandinRun, range: number, id: number | undefined): Readonly<Entity> | undefined {
  const { ctx, hero } = run;
  if (id === undefined || id === 0) {
    return nearestHostile(ctx.entities, hero, range);
  }
  const t = ctx.entities.get(id);
  if (t === undefined || t.hp <= 0 || t.team === hero.team) {
    return undefined;
  }
  const reach = range + t.radius;
  return dist2(t, hero) <= reach * reach ? t : undefined;
}

/** The point a pull draws toward: the given x/y, else the named target's position, else the nearest hostile. */
function pullPoint(run: StandinRun, range: number, aim: Aim): Point | undefined {
  const { ctx, hero } = run;
  let point: Point | undefined;
  if (aim.x !== undefined && aim.y !== undefined) {
    point = { x: aim.x, y: aim.y };
  } else if (aim.target !== undefined && aim.target !== 0) {
    point = ctx.entities.get(aim.target);
  } else {
    point = nearestHostile(ctx.entities, hero, range);
  }
  return point !== undefined && dist2(point, hero) <= range * range ? { x: point.x, y: point.y } : undefined;
}

/** Moves enemies near the aimed point toward it, then clumps them; undefined with no valid point. */
function castPull(run: StandinRun, ab: PullAbility, aim: Aim): { target: number; value: number } | undefined {
  const { ctx, hero } = run;
  const point = pullPoint(run, ab.range, aim);
  if (point === undefined) {
    return undefined;
  }
  const hit = enemiesInRadius(ctx, point, ab.radius);
  for (const e of hit) {
    const entity = ctx.entities.get(e.id);
    if (entity === undefined) {
      continue;
    }
    const dx = point.x - entity.x;
    const dy = point.y - entity.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      const step = Math.min(ab.distance, d);
      entity.x += (dx / d) * step;
      entity.y += (dy / d) * step;
    }
    const durationTicks = ticks(ab.duration);
    applyStatus(ctx, e.id, { status: 'clumped', src: hero.id, durationTicks, value: ab.value });
  }
  return { target: aim.target ?? 0, value: hit.length };
}

/** Performs the effect; returns the event fields, or undefined when there was nothing valid to do (no cooldown spent). */
function castEffect(run: StandinRun, ab: StandinAbilityDef, aim: Aim): { target: number; value: number } | undefined {
  const { ctx, hero } = run;
  switch (ab.effect) {
    case 'taunt': {
      const hit = enemiesInRadius(ctx, hero, ab.radius);
      for (const e of hit) {
        applyStatus(ctx, e.id, { status: 'taunted', src: hero.id, durationTicks: ticks(ab.duration), value: 0 });
      }
      return hit.length > 0 ? { target: 0, value: hit.length } : undefined;
    }
    case 'mark': {
      const t = markTarget(run, ab.range, aim.target);
      if (t === undefined) {
        return undefined;
      }
      applyStatus(ctx, t.id, { status: 'marked', src: hero.id, durationTicks: ticks(ab.duration), value: ab.value });
      return { target: t.id, value: ab.value };
    }
    case 'heal': {
      const allies = unitsInRadius(ctx.entities, hero, ab.radius, hero.team).filter((e) => e.kind === 'hero');
      let total = 0;
      for (const a of allies) {
        total += heal(ctx, { src: hero.id, dst: a.id, amount: ab.amount, tags: ['ability:heal'] });
      }
      return { target: 0, value: total };
    }
    case 'pull':
      return castPull(run, ab, aim);
    default: {
      const unknown: never = ab;
      throw new Error(`unhandled ability ${JSON.stringify(unknown)}`);
    }
  }
}

/** Casts `slot` if the hero has it, it is off cooldown and there is something valid to do; emits `ability`. */
function cast(run: StandinRun, slot: number, aim: Aim): void {
  const { ctx, hero, kit, def } = run;
  const ab = def.abilities.find((a) => a.slot === slot);
  if (ab === undefined || hero.hp <= 0 || (kit.cooldowns[slot] ?? 0) > 0) {
    return;
  }
  const result = castEffect(run, ab, aim);
  if (result === undefined) {
    return;
  }
  kit.cooldowns[slot] = ticks(ab.cooldown);
  ctx.emit({ tick: ctx.tick, kind: 'ability', hero: hero.id, slot, target: result.target, value: result.value });
}

export function commandStandin(run: StandinRun, cmd: HeroCommand): void {
  // Called after commandHero applied move / stop / hold / autocast.
  if (cmd.kind === 'ability') {
    cast(run, cmd.slot, cmd);
  }
}

/** Whether autocasting `ab` now would do something worthwhile (heal: only when someone is hurt). */
function autocastUseful(run: StandinRun, ab: StandinAbilityDef): boolean {
  if (ab.effect !== 'heal') {
    return true; // castEffect itself refuses when there is no valid target.
  }
  const { ctx, hero } = run;
  return unitsInRadius(ctx.entities, hero, ab.radius, hero.team).some((e) => e.kind === 'hero' && e.hp < e.maxHp);
}

function tickAbilities(run: StandinRun): void {
  const { kit, def } = run;
  for (let slot = 0; slot < SLOTS; slot++) {
    const cd = kit.cooldowns[slot] ?? 0;
    if (cd > 0) {
      kit.cooldowns[slot] = cd - 1;
    }
  }
  for (const ab of def.abilities) {
    if ((kit.autocast & (1 << ab.slot)) !== 0 && autocastUseful(run, ab)) {
      cast(run, ab.slot, {});
    }
  }
}

export function tickStandin(run: StandinRun): void {
  const { ctx, hero, kit, def } = run;
  tickAbilities(run);
  if (hero.attack.cooldown > 0) {
    hero.attack.cooldown -= 1;
    return;
  }
  const target = kit.hold ? undefined : nearestHostile(ctx.entities, hero, def.attack.range);
  hero.attack.target = target?.id ?? 0;
  if (target !== undefined) {
    const tags = def.role === 'tank' ? ['melee'] : [];
    const dealt = dealDamage(ctx, { src: hero.id, dst: target.id, amount: def.attack.damage, tags });
    if (dealt > 0) {
      // Counts down to 0 and fires on the next tick, so shots land exactly ticks(cooldown) apart.
      hero.attack.cooldown = Math.max(0, ticks(def.attack.cooldown) - 1);
    }
  }
}

/** Hashes the kit's own fields; hold and autocast are hashed by the dispatcher. */
export function hashStandin(h: StateHasher, kit: StandinState): void {
  // `?.`: test/sim/hash.test.ts relabels the Gunner's kit as 'standin' (no cooldowns) to perturb `kind`.
  for (let slot = 0; slot < SLOTS; slot++) {
    h.u32(kit.cooldowns?.[slot] ?? 0);
  }
}
