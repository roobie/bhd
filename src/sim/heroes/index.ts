// Hero kit dispatch. Each kit lives in its own file (heroes/gunner.ts, heroes/standins.ts) and
// exposes four functions: init(def), tick(run), command(run, cmd), hash(hasher, kit), where `run` is
// {ctx, hero, kit, def} (Biome allows 4 parameters at most). This file routes on `kit.kind` and owns the generic part of hero commands
// (move, stop) and the state every kit shares (hold, autocast: `KitBase`, hashed here once), so a
// kit only handles what is special to it.
// Also the engine hooks (`heroHooks`: damageTaken, healTaken) and `downKit`.
// Systems skip dead actors: a hero at 0 hp (not yet removed by the deaths system) does nothing. A new kit adds a case here.

import type { HeroDef } from '../../content/index.ts';
import { deriveRng } from '../../detmath/index.ts';
import { heroDef } from '../bargains.ts';
import type { HeroCommand } from '../commands.ts';
import type { Hooks, TickContext } from '../context.ts';
import type { Entity, HeroKitState } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { hasStatus } from '../statuses.ts';
import { perTick } from '../time.ts';
import { commandGunner, downGunner, hashGunner, initGunner, respawnGunner, tickGunner } from './gunner.ts';
import {
  commandPenitent,
  damageTakenPenitent,
  downPenitent,
  hashPenitent,
  healTakenPenitent,
  initPenitent,
  tickPenitent,
} from './penitent.ts';
import { commandPsyker, downPsyker, hashPsyker, initPsyker, tickPsyker } from './psyker.ts';
import { commandStandin, hashStandin, initStandin, tickStandin } from './standins.ts';

function initKit(ctx: TickContext, def: HeroDef, at: { readonly x: number; readonly y: number }): HeroKitState {
  switch (def.kit) {
    case 'gunner':
      return initGunner(def, at.x, at.y);
    case 'penitent':
      return initPenitent(def);
    case 'psyker':
      // The entity id the hero is about to get; the RNG stream is per hero, not per kit.
      return initPsyker(def, deriveRng(ctx.seed, `kit:psyker:${ctx.entities.nextId}`));
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
    kit: initKit(ctx, def, { x, y }),
  });
  ctx.emit({ tick: ctx.tick, kind: 'spawn', id: e.id, def: e.def, team: e.team });
  return e;
}

function runKit(ctx: TickContext, hero: Entity, run: (kit: HeroKitState, def: HeroDef) => void): void {
  // The effective def: bargains may have patched the base one.
  const def = heroDef(ctx, hero);
  if (def !== undefined && hero.kit !== undefined) {
    run(hero.kit, def);
  }
}

/** Applies a command addressed to `hero` (an existing hero): generic move/stop, then the kit. */
export function commandHero(ctx: TickContext, hero: Entity, cmd: HeroCommand): void {
  if (hero.hp <= 0) {
    return; // Downed: takes no commands until it respawns.
  }
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
    } else if (kit.kind === 'penitent' && def.kit === 'penitent') {
      commandPenitent({ ctx, hero, kit, def }, cmd);
    } else if (kit.kind === 'psyker' && def.kit === 'psyker') {
      commandPsyker({ ctx, hero, kit, def }, cmd);
    }
  });
}

/** Hero phase of the tick: every hero's kit, in ID order. */
export function heroSystem(ctx: TickContext): void {
  for (const hero of ctx.entities.values()) {
    if (hero.kind !== 'hero' || hero.hp <= 0) {
      continue;
    }
    runKit(ctx, hero, (kit, def) => tickKit(ctx, hero, kit, def));
  }
}

function tickKit(ctx: TickContext, hero: Entity, kit: HeroKitState, def: HeroDef): void {
  if (kit.kind === 'gunner' && def.kit === 'gunner') {
    tickGunner({ ctx, hero, kit, def });
  } else if (kit.kind === 'standin' && def.kit === 'standin') {
    tickStandin({ ctx, hero, kit, def });
  } else if (kit.kind === 'penitent' && def.kit === 'penitent') {
    tickPenitent({ ctx, hero, kit, def });
  } else if (kit.kind === 'psyker' && def.kit === 'psyker') {
    tickPsyker({ ctx, hero, kit, def });
  }
}

/** Kit reaction to going down (deaths system, once per down): resets its resource. */
export function downKit(ctx: TickContext, hero: Entity): void {
  runKit(ctx, hero, (kit, def) => {
    if (kit.kind === 'gunner' && def.kit === 'gunner') {
      downGunner({ ctx, hero, kit, def });
    } else if (kit.kind === 'penitent' && def.kit === 'penitent') {
      downPenitent({ ctx, hero, kit, def });
    } else if (kit.kind === 'psyker' && def.kit === 'psyker') {
      downPsyker({ ctx, hero, kit, def });
    }
  });
}

/** Kit reaction to being revived at its spawn point (respawn system, after the hero is moved). */
export function respawnKit(ctx: TickContext, hero: Entity): void {
  runKit(ctx, hero, (kit, def) => {
    if (kit.kind === 'gunner' && def.kit === 'gunner') {
      respawnGunner({ ctx, hero, kit, def });
    }
  });
}

/** The hooks `TickContext.hooks` carries: dispatch to the victim's kit; identity for everything else. */
export const heroHooks: Hooks = {
  damageTaken: (ctx, hit) => {
    let result = { amount: hit.amount, minHp: 0 };
    const { victim } = hit;
    if (victim.kind === 'hero') {
      runKit(ctx, victim, (kit, def) => {
        if (kit.kind === 'penitent' && def.kit === 'penitent') {
          result = damageTakenPenitent({ ctx, hero: victim, kit, def }, hit);
        }
      });
    }
    return result;
  },
  healTaken: (ctx, target, amount) => {
    let result = amount;
    if (target.kind === 'hero') {
      runKit(ctx, target, (kit, def) => {
        if (kit.kind === 'penitent' && def.kit === 'penitent') {
          result = healTakenPenitent({ ctx, hero: target, kit, def }, amount);
        }
      });
    }
    return result;
  },
};

/** Hashes a hero's kit state (called from hash.ts). */
export function hashKit(h: StateHasher, kit: HeroKitState): void {
  h.str(kit.kind).bool(kit.hold).u32(kit.autocast).u32(kit.respawnAt);
  switch (kit.kind) {
    case 'penitent':
      hashPenitent(h, kit);
      return;
    case 'psyker':
      hashPsyker(h, kit);
      return;
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
