// Props: placed barriers (the Gunner's Pavise). A prop is an entity of kind `prop` with hp 1 that
// nothing targets or damages (queries and `dealDamage` skip it); it only blocks segments, through
// `firstBarrier` (query.ts). Hashed through the generic entity hash (`Entity.prop`).

import type { TickContext } from './context.ts';
import type { Entity } from './entities.ts';

export interface NewProp {
  /** Content-ish id for drawing and logs, e.g. `pavise`. */
  readonly def: string;
  /** Hero entity id of the placer; the prop takes its team. */
  readonly owner: number;
  readonly x: number;
  readonly y: number;
  /** Unit vector ALONG the barrier. */
  readonly ux: number;
  readonly uy: number;
  readonly halfLength: number;
  /** Lifetime in whole ticks (use `ticks()`); the prop is gone from tick + durationTicks on. */
  readonly durationTicks: number;
}

/** Spawns a prop and emits `spawn`; returns undefined when the owner is missing. */
export function spawnProp(ctx: TickContext, p: NewProp): Entity | undefined {
  const owner = ctx.entities.get(p.owner);
  if (owner === undefined) {
    return undefined;
  }
  const e = ctx.entities.add({
    kind: 'prop',
    def: p.def,
    team: owner.team,
    x: p.x,
    y: p.y,
    radius: 0,
    maxHp: 1,
    armour: 0,
    speed: 0,
    prop: { owner: p.owner, until: ctx.tick + p.durationTicks, ux: p.ux, uy: p.uy, halfLength: p.halfLength },
  });
  ctx.emit({ tick: ctx.tick, kind: 'spawn', id: e.id, def: e.def, team: e.team });
  return e;
}

/** Removes expired props, emitting `despawn` (no `death`: a prop is not a unit). Runs right after statuses. */
export function propSystem(ctx: TickContext): void {
  for (const e of ctx.entities.values()) {
    if (e.kind === 'prop' && e.prop !== undefined && ctx.tick >= e.prop.until) {
      ctx.entities.remove(e.id);
      ctx.emit({ tick: ctx.tick, kind: 'despawn', id: e.id });
    }
  }
}
