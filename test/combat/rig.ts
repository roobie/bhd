import { defaultGame } from '../../src/content/index.ts';
import type { TickContext } from '../../src/sim/context.ts';
import type { Entity, NewEntity } from '../../src/sim/entities.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { heroHooks } from '../../src/sim/heroes/index.ts';
import { Sim } from '../../src/sim/sim.ts';

export interface Rig {
  readonly sim: Sim;
  readonly events: SimEvent[];
  readonly ctx: TickContext;
  /** Adds a test unit; defaults to an enemy (team 1) with 1000 hp and no armour. */
  readonly add: (over?: Partial<NewEntity>) => Entity;
}

/** A sim with the default lineup plus a hand-built context at tick 10 (the Sim's own is private). */
export function rig(): Rig {
  const sim = new Sim({ seed: 1, game: defaultGame() });
  const events: SimEvent[] = [];
  const ctx: TickContext = {
    tick: 10,
    entities: sim.entities,
    seed: 1,
    rng: sim.rng,
    hooks: heroHooks,
    emit: (e) => {
      events.push(e);
    },
    game: sim.game,
    waves: sim.waves,
    intents: sim.intents,
    master: sim.master,
    cast: () => false,
    ancientId: 1,
    killers: new Map<number, number>(),
    end: () => undefined,
  };
  const add = (over: Partial<NewEntity> = {}): Entity =>
    sim.entities.add({
      kind: 'enemy',
      def: 'dummy',
      team: 1,
      x: 0,
      y: 0,
      radius: 0.5,
      maxHp: 1000,
      armour: 0,
      speed: 3,
      ...over,
    });
  return { sim, events, ctx, add };
}
