// Hero kit dispatch. Each kit lives in its own file (heroes/gunner.ts, heroes/standins.ts) and
// exposes four functions: init(def), tick(run), command(run, cmd), hash(hasher, kit), where `run` is
// {ctx, hero, kit, def} (Biome allows 4 parameters at most). This file routes on `kit.kind` and owns the generic part of hero commands
// (move, stop) and the state every kit shares (hold, autocast: `KitBase`, hashed here once), so a
// kit only handles what is special to it.
// Systems skip dead actors: a hero at 0 hp (not yet removed by the deaths system) does nothing. A new kit adds a case here.

import type { HeroDef } from '../../content/index.ts';
import { findById } from '../../content/types.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, HeroKitState } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { hasStatus } from '../statuses.ts';
import { perTick } from '../time.ts';
import { commandGunner, hashGunner, initGunner, tickGunner } from './gunner.ts';
import { commandStandin, hashStandin, initStandin, tickStandin } from './standins.ts';

function initKit(def: HeroDef): HeroKitState {
  switch (def.kit) {
    case 'gunner':
      return initGunner(def);
    case 'standin':
      return initStandin(def);
    default: {
      const unknown: never = def;
      throw new Error(`unhandled hero kit ${JSON.stringify(unknown)}`);
    }
  }
}

/** Spawns a hero for `def` at (x, y) and emits `spawn`. */
export function spawnHero(ctx: TickContext, def: HeroDef, x: number, y: number): Entity {
  const e = ctx.entities.add({
    kind: 'hero',
    def: def.id,
    team: 0,
    x,
    y,
    radius: def.radius,
    maxHp: def.maxHp,
    armour: def.armour,
    speed: perTick(def.speed),
    kit: initKit(def),
  });
  ctx.emit({ tick: ctx.tick, kind: 'spawn', id: e.id, def: e.def, team: e.team });
  return e;
}

function runKit(ctx: TickContext, hero: Entity, run: (kit: HeroKitState, def: HeroDef) => void): void {
  const def = findById(ctx.game.heroes, hero.def);
  if (def !== undefined && hero.kit !== undefined) {
    run(hero.kit, def);
  }
}

/** Applies a command addressed to `hero` (an existing hero): generic move/stop, then the kit. */
export function commandHero(ctx: TickContext, hero: Entity, cmd: HeroCommand): void {
  if (cmd.kind === 'move') {
    if (hasStatus(hero, 'rooted')) {
      return; // Rooted (e.g. braced): cannot be ordered to move.
    }
    hero.move.mode = 'point';
    hero.move.tx = cmd.x;
    hero.move.ty = cmd.y;
  } else if (cmd.kind === 'stop') {
    hero.move.mode = 'idle';
    hero.attack.target = 0;
  }
  if (hero.kit !== undefined) {
    if (cmd.kind === 'hold') {
      hero.kit.hold = cmd.on;
    } else if (cmd.kind === 'autocast') {
      const bit = 1 << cmd.slot;
      hero.kit.autocast = cmd.on ? hero.kit.autocast | bit : hero.kit.autocast & ~bit;
    }
  }
  runKit(ctx, hero, (kit, def) => {
    if (kit.kind === 'gunner' && def.kit === 'gunner') {
      commandGunner({ ctx, hero, kit, def }, cmd);
    } else if (kit.kind === 'standin' && def.kit === 'standin') {
      commandStandin({ ctx, hero, kit, def }, cmd);
    }
  });
}

/** Hero phase of the tick: every hero's kit, in ID order. */
export function heroSystem(ctx: TickContext): void {
  for (const hero of ctx.entities.values()) {
    if (hero.kind !== 'hero' || hero.hp <= 0) {
      continue;
    }
    runKit(ctx, hero, (kit, def) => {
      if (kit.kind === 'gunner' && def.kit === 'gunner') {
        tickGunner({ ctx, hero, kit, def });
      } else if (kit.kind === 'standin' && def.kit === 'standin') {
        tickStandin({ ctx, hero, kit, def });
      }
    });
  }
}

/** Hashes a hero's kit state (called from hash.ts). */
export function hashKit(h: StateHasher, kit: HeroKitState): void {
  h.str(kit.kind).bool(kit.hold).u32(kit.autocast);
  switch (kit.kind) {
    case 'gunner':
      hashGunner(h, kit);
      return;
    case 'standin':
      hashStandin(h, kit);
      return;
    default: {
      const unknown: never = kit;
      throw new Error(`unhandled kit state ${JSON.stringify(unknown)}`);
    }
  }
}
