// Enemies. Owner: lane-waves.
// Lane enemies (spawned by waves, `move.waypoint >= 1`) walk the lane. Each tick, in ID order:
//  1. Target: the `src` of a live `taunted` status (several: the one lasting longest, ties to the
//     lower id; a dead or missing taunter is ignored) wins, from any distance. Otherwise the
//     current target is kept while it is alive and within LEASH_RANGE. Otherwise the nearest hero
//     within AGGRO_RANGE (ties to the lower id). The leash is also anchored to the lane: a lane
//     enemy more than LEASH_RANGE from the lane polyline (non-taunted) drops its target and
//     acquires none until it is back, so a hero cannot drag enemies away forever. (Derived from
//     the position: the entity has no spare field to store the exact point it left the lane.)
//     Only heroes are aggro targets: the Ancient is hit
//     by leaking only.
//  2. Move: out of attack range, chase (`point` mode toward the target); in range, stand (`idle`).
//     With no target any more (it died, or left the leash), the enemy returns to the lane at the
//     waypoint it was heading for (`lane` mode).
//  3. Attack: a melee hit through dealDamage when in range and the cooldown is 0.
//  4. Leak: at the end of the lane, damage the Ancient (tag `leak`, exact leakDamage), emit `leak`, remove.
// Debug-spawned enemies (idle, waypoint 0) pick targets the same way but never chase or walk: they
// only hit a target that is already in attack range.
// Systems skip dead actors: an enemy at 0 hp (not yet removed by the deaths system) does nothing.
// Taunt is pure status application: stand-in heroes never need to edit this file.
// AGGRO_RANGE and LEASH_RANGE are code constants because the shared EnemyDef (contracts) has no
// such fields.

import type { EnemyDef, Point } from '../content/types.ts';
import { findById } from '../content/types.ts';
import { dealDamage } from './combat.ts';
import type { TickContext } from './context.ts';
import type { Entity, MoveMode } from './entities.ts';
import { perTick, ticks } from './time.ts';

/** World units: a hero whose body is this close to a lane enemy draws it off the lane. */
export const AGGRO_RANGE = 6;
/** World units: an enemy gives up a (non-taunted) target farther than this and returns to the lane. */
export const LEASH_RANGE = 10;

/** Spawns an enemy at `at` and emits `spawn`. `lane` enemies head for waypoint 1 (they start on waypoint 0). */
export function spawnEnemy(ctx: TickContext, def: EnemyDef, at: Point, mode: MoveMode): Entity {
  const e = ctx.entities.add({
    kind: 'enemy',
    def: def.id,
    team: 1,
    x: at.x,
    y: at.y,
    radius: def.radius,
    maxHp: def.maxHp,
    armour: def.armour,
    speed: perTick(def.speed),
    move: { mode, tx: at.x, ty: at.y, waypoint: mode === 'lane' ? 1 : 0 },
  });
  ctx.emit({ tick: ctx.tick, kind: 'spawn', id: e.id, def: e.def, team: e.team });
  return e;
}

/** Entity id of the live taunter with the longest-lasting `taunted` instance on `e`; 0 if none. */
function taunter(ctx: TickContext, e: Readonly<Entity>): number {
  let best = 0;
  let bestUntil = 0;
  for (const s of e.statuses) {
    const src = ctx.entities.get(s.src);
    if (
      s.status === 'taunted' &&
      s.until > ctx.tick &&
      (s.until > bestUntil || (s.until === bestUntil && s.src < best)) &&
      src !== undefined &&
      src.hp > 0
    ) {
      best = s.src;
      bestUntil = s.until;
    }
  }
  return best;
}

function dist2(a: Readonly<Point>, b: Readonly<Point>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** True when `b`'s body is within `range` of `a`'s centre. */
function within(a: Readonly<Point>, b: Readonly<Entity>, range: number): boolean {
  const reach = range + b.radius;
  return dist2(a, b) <= reach * reach;
}

/** Nearest live hero whose body is within `range`; ties go to the lower id (ID order, strict <). */
function nearestHero(ctx: TickContext, from: Readonly<Point>, range: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD2 = 0;
  for (const h of ctx.entities.values()) {
    if (h.kind !== 'hero' || h.hp <= 0 || !within(from, h, range)) {
      continue;
    }
    const d2 = dist2(from, h);
    if (best === undefined || d2 < bestD2) {
      best = h;
      bestD2 = d2;
    }
  }
  return best;
}

/** Distance from `p` to the nearest point of the lane polyline. */
function laneDistance(p: Readonly<Point>, lane: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < lane.length; i++) {
    const a = lane[i];
    const b = lane[i + 1] ?? a;
    if (a === undefined || b === undefined) {
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.sqrt(dist2(p, { x: a.x + t * dx, y: a.y + t * dy })));
  }
  return best;
}

/** Picks the target id (0 for none) for a lane enemy; see the file header. */
function chooseTarget(ctx: TickContext, e: Readonly<Entity>): number {
  const taunted = taunter(ctx, e);
  if (taunted !== 0) {
    return taunted;
  }
  if (e.move.waypoint > 0 && laneDistance(e, ctx.game.map.lane) > LEASH_RANGE) {
    return 0;
  }
  const current = ctx.entities.get(e.attack.target);
  if (current !== undefined && current.hp > 0 && current.kind === 'hero' && within(e, current, LEASH_RANGE)) {
    return current.id;
  }
  return nearestHero(ctx, e, AGGRO_RANGE)?.id ?? 0;
}

function engage(ctx: TickContext, e: Entity, def: EnemyDef, laneEnemy: boolean): void {
  if (e.attack.cooldown > 0) {
    e.attack.cooldown -= 1;
  }
  const had = e.attack.target !== 0;
  e.attack.target = chooseTarget(ctx, e);
  const target = ctx.entities.get(e.attack.target);
  if (target === undefined) {
    if (had && laneEnemy) {
      e.move.mode = 'lane';
    }
    return;
  }
  if (!within(e, target, def.attack.range)) {
    if (laneEnemy) {
      e.move.mode = 'point';
      e.move.tx = target.x;
      e.move.ty = target.y;
    }
    return;
  }
  if (laneEnemy) {
    e.move.mode = 'idle';
  }
  if (e.attack.cooldown === 0) {
    const amount = def.attack.damage;
    if (dealDamage(ctx, { src: e.id, dst: target.id, amount, tags: ['melee'] }) > 0) {
      e.attack.cooldown = ticks(def.attack.cooldown);
    }
  }
}

/** Enemy phase of the tick: aggro, move orders, attacks, then leaks (damage the Ancient, emit `leak`, remove). */
export function enemySystem(ctx: TickContext): void {
  const laneLength = ctx.game.map.lane.length;
  for (const e of ctx.entities.values()) {
    if (e.kind !== 'enemy' || e.hp <= 0) {
      continue;
    }
    const def = findById(ctx.game.enemies, e.def);
    if (def !== undefined) {
      engage(ctx, e, def, e.move.waypoint > 0);
    }
    if (e.move.mode !== 'lane' || e.move.waypoint < laneLength) {
      continue;
    }
    // Leak damage carries the `leak` tag: it bypasses modifiers, so livesLost is exactly leakDamage.
    const livesLost = dealDamage(ctx, {
      src: e.id,
      dst: ctx.ancientId,
      amount: def?.leakDamage ?? 1,
      tags: ['leak'],
    });
    ctx.emit({ tick: ctx.tick, kind: 'leak', id: e.id, livesLost });
    ctx.entities.remove(e.id);
  }
}
