// Deaths: emit `death`, remove, and end the game. Runs last before the hash.
// End rule: the Ancient at 0 hp ends the game ('ancient-destroyed'); otherwise, once every wave
// has spawned and no enemy is left, the game ends with 'victory'. After `end` the Sim stops
// running gameplay (it still counts ticks and emits `hash` events).

import type { TickContext } from './context.ts';
import { wavesExhausted } from './waves.ts';

export function deathSystem(ctx: TickContext): void {
  let enemies = 0;
  for (const e of ctx.entities.values()) {
    if (e.hp <= 0) {
      ctx.emit({ tick: ctx.tick, kind: 'death', id: e.id, killer: ctx.killers.get(e.id) ?? 0 });
      ctx.entities.remove(e.id);
    } else if (e.kind === 'enemy') {
      enemies += 1;
    }
  }
  if (ctx.entities.get(ctx.ancientId) === undefined) {
    ctx.end('ancient-destroyed');
  } else if (enemies === 0 && wavesExhausted(ctx)) {
    ctx.end('victory');
  }
}
