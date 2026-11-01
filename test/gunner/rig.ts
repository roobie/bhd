// Helpers for the Gunner tests: a one-hero game (the Gunner at the origin, id 2), a wave far in the
// future so the game never ends, and stationary dummy units (no enemy def, so they do nothing).

import type { GunnerDef } from '../../src/content/heroes/gunner.ts';
import { gunnerDef } from '../../src/content/heroes/gunner.ts';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { Entity } from '../../src/sim/entities.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import type { GunnerState } from '../../src/sim/heroes/gunner.ts';
import { Sim } from '../../src/sim/sim.ts';

export const GUNNER = 2;

/** Gunner def with a fast heat build and constant fire rate (period 6 ticks), unless overridden. */
export function fastHeat(over: Partial<GunnerDef> = {}): GunnerDef {
  const base = gunnerDef();
  return {
    ...base,
    spin: { ...base.spin, min: 1, max: 1 },
    heat: { ...base.heat, perShot: 0.1 },
    ...over,
  };
}

export interface GunnerRig {
  readonly sim: Sim;
  readonly events: SimEvent[];
  readonly gunner: Entity;
  readonly kit: GunnerState;
  /** A stationary hostile with plenty of hp. */
  readonly dummy: (x: number, y: number, armour?: number) => Entity;
  /** A stationary friendly (team 0) with plenty of hp. */
  readonly ally: (x: number, y: number) => Entity;
  /** Steps `n` ticks, collecting every event into `events`; returns that slice. */
  readonly step: (n: number) => SimEvent[];
  /** Queues an ability command for the next tick (no step). */
  readonly cast: (slot: number, x?: number, y?: number) => void;
}

export function gunnerRig(def: GunnerDef = gunnerDef()): GunnerRig {
  const base = defaultGame();
  const game: GameConfig = {
    ...base,
    map: { ...base.map, heroSpawns: [{ x: 0, y: 0 }] },
    heroes: [def],
    waves: { firstDelay: 100_000, interval: 1, waves: [{ spawns: [{ def: 'grunt', count: 1, gap: 1 }] }] },
  };
  const sim = new Sim({ seed: 1, game });
  const events: SimEvent[] = [];
  const gunner = sim.entities.get(GUNNER);
  if (gunner?.kit?.kind !== 'gunner') {
    throw new Error('no gunner');
  }
  const add = (team: 0 | 1, x: number, y: number, armour: number): Entity =>
    sim.entities.add({
      kind: team === 0 ? 'hero' : 'enemy',
      def: 'dummy',
      team,
      x,
      y,
      radius: 0.5,
      maxHp: 1_000_000,
      armour,
      speed: 0,
    });
  return {
    sim,
    events,
    gunner,
    kit: gunner.kit,
    dummy: (x, y, armour = 0) => add(1, x, y, armour),
    ally: (x, y) => add(0, x, y, 0),
    step: (n) => {
      const out: SimEvent[] = [];
      for (let i = 0; i < n; i++) {
        out.push(...sim.step());
      }
      events.push(...out);
      return out;
    },
    cast: (slot, x, y) => {
      sim.command(
        0,
        x === undefined || y === undefined
          ? { kind: 'ability', hero: GUNNER, slot }
          : { kind: 'ability', hero: GUNNER, slot, x, y },
      );
    },
  };
}

export type DmgEvent = Extract<SimEvent, { kind: 'dmg' }>;

export function dmgFrom(events: readonly SimEvent[], src = GUNNER): DmgEvent[] {
  return events.filter((e): e is DmgEvent => e.kind === 'dmg' && e.src === src);
}

export function heatBands(events: readonly SimEvent[]): number[] {
  return events.flatMap((e) => (e.kind === 'resource' && e.resource === 'heat' ? [e.band] : []));
}
