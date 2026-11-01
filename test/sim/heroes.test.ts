import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { ticks } from '../../src/sim/time.ts';

const GUNNER = 2;
const RANGED = 4;

function dmgBy(events: readonly SimEvent[], src: number): SimEvent[] {
  return events.filter((e) => e.kind === 'dmg' && e.src === src);
}

function stepN(sim: Sim, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    out.push(...sim.step());
  }
  return out;
}

describe('hero kit stubs', () => {
  it('auto-attack the nearest hostile in range on their cooldown', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    // Gunner spawns at (80, 28), range 12. Two grunts: one close, one in range but farther.
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 76, y: 28 }, 1);
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 70, y: 28 }, 1);
    const events = stepN(sim, 30);
    const hits = dmgBy(events, GUNNER);
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((e) => e.kind === 'dmg' && e.dst === 6 && e.amount === 7)).toBe(true);
    // grunt armour 1 takes 8 down to 7. The Gunner starts at spin 0: 40% fire rate, so 6 ticks / 0.4 = 15 ticks between shots.
    expect(hits[1]?.tick).toBe((hits[0]?.tick ?? 0) + ticks(0.2) / 0.4);
  });

  it('do not attack out of range', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 0, y: 0 }, 1);
    expect(dmgBy(stepN(sim, 30), GUNNER)).toEqual([]);
  });

  it('respect hold fire, and resume when it is released', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'spawn', def: 'brute', x: 76, y: 28 }, 1);
    sim.command(0, { kind: 'hold', hero: GUNNER, on: true }, 1);
    sim.command(0, { kind: 'hold', hero: RANGED, on: true }, 1);
    expect(dmgBy(stepN(sim, 40), GUNNER)).toEqual([]);
    expect(dmgBy(stepN(sim, 1), RANGED)).toEqual([]);
    sim.command(0, { kind: 'hold', hero: GUNNER, on: false });
    expect(dmgBy(stepN(sim, 20), GUNNER).length).toBeGreaterThan(0);
    expect(sim.entities.get(RANGED)?.kit).toMatchObject({ kind: 'standin', hold: true });
  });

  it('a killed enemy gets a death event naming the killer and is removed', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'spawn', def: 'runner', x: 76, y: 28 }, 1);
    const events = stepN(sim, 60);
    expect(events.find((e) => e.kind === 'death')).toMatchObject({ id: 6, killer: GUNNER });
    expect(sim.entities.get(6)).toBeUndefined();
  });
});
