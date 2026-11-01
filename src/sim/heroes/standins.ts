// Stand-in hero kits: PLACEHOLDERS (project DESIGN.md §7, wave 1d), no resources. Owner: stand-in-heroes.
// STUB: basic auto-attack on the nearest hostile in range; respects hold fire.
// Every field added to StandinState MUST be added to hashStandin (L-53OTZPIIVO2XYNNL).

import type { StandinDef } from '../../content/heroes/standins.ts';
import { dealDamage } from '../combat.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';
import { nearestHostile } from '../query.ts';
import { ticks } from '../time.ts';

export interface StandinState extends KitBase {
  readonly kind: 'standin';
}

export function initStandin(_def: StandinDef): StandinState {
  return { kind: 'standin', hold: false, autocast: 0 };
}

/** Everything a kit function needs about one hero. */
interface StandinRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: StandinState;
  readonly def: StandinDef;
}

export function commandStandin(_run: StandinRun, _cmd: HeroCommand): void {
  // Called after commandHero applied move / stop / hold / autocast. ability: not implemented yet.
}

export function tickStandin(run: StandinRun): void {
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
export function hashStandin(_h: StateHasher, _kit: StandinState): void {
  // No kit-specific state yet.
}
