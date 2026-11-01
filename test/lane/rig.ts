// Shared helpers for the lane tests: a straight 60-unit lane (grunt speed 3 = 0.1 per tick) with
// three held stand-in heroes that tests move around by hand.

import type { GameConfig } from '../../src/content/index.ts';
import type { WaveSchedule } from '../../src/content/types.ts';
import type { Entity } from '../../src/sim/entities.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { legacyGame } from '../legacy.ts';

export const TANK = 2;
export const RANGED = 3;
export const SUPPORT = 4;

function laneGame(waves: WaveSchedule, ancientHp = 20): GameConfig {
  const base = legacyGame();
  const [, tank, ranged, support] = base.heroes;
  if (tank === undefined || ranged === undefined || support === undefined) {
    throw new Error('default lineup changed');
  }
  return {
    ...base,
    map: {
      ...base.map,
      lane: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
      ],
      ancient: { x: 60, y: 0, radius: 1, maxHp: ancientHp },
      heroSpawns: [{ x: 30, y: 40 }],
    },
    heroes: [tank, ranged, support],
    waves,
  };
}

/** One wave of `count` units of `def`, starting at 1 s (tick 30). */
export function oneWave(def: string, count: number, gap = 1): WaveSchedule {
  return { firstDelay: 1, interval: 100, waves: [{ spawns: [{ def, count, gap }] }] };
}

/** A sim over `laneGame` whose heroes hold fire and are parked far from the lane. */
export function heldSim(waves: WaveSchedule, ancientHp = 20): Sim {
  const sim = new Sim({ seed: 1, game: laneGame(waves, ancientHp) });
  for (const id of [TANK, RANGED, SUPPORT]) {
    const h = unit(sim, id);
    if (h.kit !== undefined) {
      h.kit.hold = true;
    }
  }
  return sim;
}

export function unit(sim: Sim, id: number): Entity {
  const e = sim.entities.get(id);
  if (e === undefined) {
    throw new Error(`no entity ${id}`);
  }
  return e;
}

export function place(sim: Sim, id: number, x: number, y: number): void {
  const e = unit(sim, id);
  e.x = x;
  e.y = y;
}

export function stepUntil(sim: Sim, done: (events: SimEvent[]) => boolean, limit = 20_000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < limit && !sim.ended; i++) {
    all.push(...sim.step());
    if (done(all)) {
      break;
    }
  }
  return all;
}

/** Steps until the first enemy exists; returns it. */
export function firstEnemy(sim: Sim): Entity {
  stepUntil(sim, () => [...sim.entities.values()].some((u) => u.kind === 'enemy'));
  const e = [...sim.entities.values()].find((x) => x.kind === 'enemy');
  if (e === undefined) {
    throw new Error('no enemy spawned');
  }
  return e;
}
