// Enemies. Owner: lane-waves. STUB: lane-followers that leak at the end of the lane. Attacks on
// heroes come later.
// Systems skip dead actors: an enemy at 0 hp (not yet removed by the deaths system) neither
// aggros nor leaks.
// Aggro: an enemy's attack target is the `src` of its live `taunted` status (several: the one
// lasting longest, ties to the lower id; a dead or missing taunter is ignored), else the nearest
// hostile in attack range. Taunt is therefore pure status application: stand-in heroes never need
// to edit this file.

import type { EnemyDef, Point } from '../content/types.ts';
import { findById } from '../content/types.ts';
import { dealDamage } from './combat.ts';
import type { TickContext } from './context.ts';
import type { Entity, MoveMode } from './entities.ts';
import { nearestHostile } from './query.ts';
import { perTick } from './time.ts';

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
    if (s.status === 'taunted' && s.until > ctx.tick && s.until > bestUntil && src !== undefined && src.hp > 0) {
      best = s.src;
      bestUntil = s.until;
    }
  }
  return best;
}

/** Enemy phase of the tick: aggro, then leaks (damage the Ancient, emit `leak`, remove). */
export function enemySystem(ctx: TickContext): void {
  const laneLength = ctx.game.map.lane.length;
  for (const e of ctx.entities.values()) {
    if (e.kind !== 'enemy' || e.hp <= 0) {
      continue;
    }
    const def = findById(ctx.game.enemies, e.def);
    const taunted = taunter(ctx, e);
    e.attack.target = taunted === 0 ? (nearestHostile(ctx.entities, e, def?.attack.range ?? 0)?.id ?? 0) : taunted;
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
