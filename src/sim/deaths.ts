// Deaths: emit `death`, remove, and end the game. Runs last before the hash.
// Enemies are removed at 0 hp. Heroes are not: a hero reaching 0 hp is downed once (`death` event,
// respawn timer, see respawn.ts) and returns later. Props are never at 0 hp.
// End rule: the Ancient at 0 hp ends the game ('ancient-destroyed'); otherwise, once every wave
// has spawned and no enemy is left, the game ends with 'victory'. With `rules.wipeLoses` set, no
// hero up (all downed) ends it with 'team-wiped'. After `end` the Sim stops
// running gameplay (it still counts ticks and emits `hash` events).

import type { TickContext } from './context.ts';
import type { Entity } from './entities.ts';
import { downHero, isDowned } from './respawn.ts';
import { wavesExhausted } from './waves.ts';

/** Emits the death of `e` and downs it (heroes) or removes it (everything else). */
function bury(ctx: TickContext, e: Entity): void {
  ctx.emit({ tick: ctx.tick, kind: 'death', id: e.id, killer: ctx.killers.get(e.id) ?? 0 });
  if (e.kind === 'hero') {
    downHero(ctx, e);
  } else {
    ctx.entities.remove(e.id);
  }
}

interface Census {
  enemies: number;
  heroes: number;
  heroesUp: number;
}

/** Buries the dead and counts what is left. */
function sweep(ctx: TickContext): Census {
  const census: Census = { enemies: 0, heroes: 0, heroesUp: 0 };
  for (const e of ctx.entities.values()) {
    if (e.hp <= 0 && !(e.kind === 'hero' && isDowned(e))) {
      bury(ctx, e);
    } else if (e.kind === 'enemy') {
      census.enemies += 1;
    }
    if (e.kind === 'hero') {
      census.heroes += 1;
      census.heroesUp += e.hp > 0 ? 1 : 0;
    }
  }
  return census;
}

export function deathSystem(ctx: TickContext): void {
  const { enemies, heroes, heroesUp } = sweep(ctx);
  if (ctx.entities.get(ctx.ancientId) === undefined) {
    ctx.end('ancient-destroyed');
  } else if (ctx.game.rules.wipeLoses && heroes > 0 && heroesUp === 0) {
    ctx.end('team-wiped');
  } else if (enemies === 0 && wavesExhausted(ctx)) {
    ctx.end('victory');
  }
}
