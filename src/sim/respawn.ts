// Hero down and respawn (D-IYLBKMAIQNR7GE3R and the w6 answer "timer based on which wave").
// A hero at 0 hp is NOT removed: it stays in the store, downed (`kit.respawnAt` > 0), skipped by
// every system (they all skip hp <= 0), unable to move or take commands. `downHero` runs from the
// deaths system once per down; `respawnSystem` revives it at its spawn point with full hp.
// Timer (ticks) = ticks(min(rules.respawn.max, rules.respawn.base + rules.respawn.perWave * wave)),
// where wave = waves started so far. `rules.wipeLoses` (default false) ends the game when no hero is up.

import { dropHeroIntents } from '../intents/board.ts';
import type { TickContext } from './context.ts';
import type { Entity } from './entities.ts';
import { downKit, respawnKit } from './heroes/index.ts';
import { removeStatus } from './statuses.ts';
import { ticks } from './time.ts';

/** Ticks a hero downed now stays down. At least 1. */
function respawnTicks(ctx: TickContext): number {
  const { base, perWave, max } = ctx.game.rules.respawn;
  return Math.max(1, ticks(Math.min(max, base + perWave * ctx.waves.n)));
}

/** True for a downed hero (hp 0, waiting to respawn). */
export function isDowned(e: Readonly<Entity>): boolean {
  return e.kind === 'hero' && e.hp <= 0 && (e.kit?.respawnAt ?? 0) > 0;
}

/** Ticks until a downed hero respawns (0 if it is not down). */
export function respawnLeft(e: Readonly<Entity>, tick: number): number {
  return isDowned(e) ? Math.max(0, (e.kit?.respawnAt ?? 0) - tick) : 0;
}

/** Puts a hero that just reached 0 hp into the downed state (no event: the deaths system emits `death`). */
export function downHero(ctx: TickContext, hero: Entity): void {
  if (hero.kit === undefined) {
    return;
  }
  hero.hp = 0;
  hero.kit.respawnAt = ctx.tick + respawnTicks(ctx);
  for (const status of new Set(hero.statuses.map((s) => s.status))) {
    removeStatus(ctx, hero.id, status);
  }
  hero.move.mode = 'idle';
  hero.move.tx = hero.x;
  hero.move.ty = hero.y;
  hero.attack.target = 0;
  hero.attack.cooldown = 0;
  dropHeroIntents(ctx, hero.id);
  downKit(ctx, hero);
}

/** Revives due heroes at `heroSpawns[slot]` with full hp and emits `respawn`. Runs first in the tick, before the commands. */
export function respawnSystem(ctx: TickContext): void {
  const spawns = ctx.game.map.heroSpawns;
  for (const hero of ctx.entities.values()) {
    if (!isDowned(hero) || hero.kit === undefined || ctx.tick < hero.kit.respawnAt) {
      continue;
    }
    const slot = Math.max(
      0,
      ctx.game.heroes.findIndex((d) => d.id === hero.def),
    );
    const at = spawns[slot % Math.max(1, spawns.length)] ?? ctx.game.map.ancient;
    hero.x = at.x;
    hero.y = at.y;
    hero.hp = hero.maxHp;
    hero.kit.respawnAt = 0;
    hero.move.mode = 'idle';
    hero.move.tx = at.x;
    hero.move.ty = at.y;
    respawnKit(ctx, hero);
    ctx.emit({ tick: ctx.tick, kind: 'respawn', id: hero.id });
  }
}
