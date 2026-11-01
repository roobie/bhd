// Gunner "The Furnace" kit (project DESIGN.md §4.1). Owner: gunner.
// STUB: basic auto-attack on the nearest hostile in range; respects hold fire.
// Every field added to GunnerState MUST be added to hashGunner (L-53OTZPIIVO2XYNNL).

import type { GunnerDef } from '../../content/heroes/gunner.ts';
import { dealDamage } from '../combat.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { nearestHostile } from '../query.ts';
import { ticks } from '../time.ts';

export interface GunnerState extends KitBase {
  readonly kind: 'gunner';
}

export function initGunner(_def: GunnerDef): GunnerState {
  return { kind: 'gunner', hold: false, autocast: 0 };
}

/** Everything a kit function needs about one hero. */
interface GunnerRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: GunnerState;
  readonly def: GunnerDef;
}

export function commandGunner(_run: GunnerRun, _cmd: HeroCommand): void {
  // Called after commandHero applied move / stop / hold / autocast. ability: not implemented yet.
}

export function tickGunner(run: GunnerRun): void {
  const { ctx, hero, kit, def } = run;
  if (hero.attack.cooldown > 0) {
    hero.attack.cooldown -= 1;
    return;
  }
  const target = kit.hold ? undefined : nearestHostile(ctx.entities, hero, def.attack.range);
  hero.attack.target = target?.id ?? 0;
  if (target !== undefined) {
    const dealt = dealDamage(ctx, { src: hero.id, dst: target.id, amount: def.attack.damage, tags: [] });
    if (dealt > 0) {
      hero.attack.cooldown = ticks(def.attack.cooldown);
    }
  }
}

/** Hashes the kit's own fields; hold and autocast are hashed by the dispatcher. */
export function hashGunner(_h: StateHasher, _kit: GunnerState): void {
  // No kit-specific state yet.
}
