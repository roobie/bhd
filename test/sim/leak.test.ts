import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';

/** A 3-point lane 6 units long, no heroes, one wave of `count` grunts (speed 3 = 0.1 per tick). */
function shortGame(count: number, ancientHp: number, def = 'grunt'): GameConfig {
  const base = defaultGame();
  return {
    ...base,
    map: {
      ...base.map,
      lane: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
      ],
      ancient: { x: 3, y: 3, radius: 1, maxHp: ancientHp },
    },
    heroes: [],
    waves: { firstDelay: 0.1, interval: 10, waves: [{ spawns: [{ def, count, gap: 1 }] }] },
  };
}

function runUntilEnd(sim: Sim, limit: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < limit && !sim.ended; i++) {
    events.push(...sim.step());
  }
  return events;
}

describe('leaks', () => {
  it('cost the Ancient exactly the enemy leakDamage', () => {
    const sim = new Sim({ seed: 1, game: shortGame(1, 10, 'brute') });
    const events = runUntilEnd(sim, 400);
    expect(events.find((e) => e.kind === 'leak')).toMatchObject({ livesLost: 2 });
    expect(sim.entities.get(1)?.hp).toBe(8);
  });

  it('a corpse does not leak', () => {
    const sim = new Sim({ seed: 1, game: shortGame(1, 10) });
    for (let i = 0; i < 4 && sim.entities.size < 2; i++) {
      sim.step();
    }
    const enemy = sim.entities.get(2);
    if (enemy === undefined) {
      throw new Error('no enemy');
    }
    enemy.move.waypoint = 3;
    enemy.hp = 0;
    const events = sim.step();
    expect(events.filter((e) => e.kind === 'leak')).toEqual([]);
    expect(events.find((e) => e.kind === 'death')).toMatchObject({ id: 2 });
    expect(sim.entities.get(1)?.hp).toBe(10);
  });

  it('an enemy that walks the lane damages the Ancient, emits leak and is removed', () => {
    const sim = new Sim({ seed: 1, game: shortGame(1, 10) });
    const events = runUntilEnd(sim, 200);
    const leak = events.find((e) => e.kind === 'leak');
    expect(leak).toMatchObject({ kind: 'leak', id: 2, livesLost: 1 });
    expect(sim.entities.get(2)).toBeUndefined();
    expect(sim.entities.get(1)?.hp).toBe(9);
    expect(events.filter((e) => e.kind === 'dmg')).toEqual([
      { tick: leak?.tick, kind: 'dmg', src: 2, dst: 1, amount: 1, tags: ['leak'] },
    ]);
  });

  it('takes the walking time: 6 units at 0.1 per tick, moving on its spawn tick too', () => {
    const sim = new Sim({ seed: 1, game: shortGame(1, 10) });
    const events = runUntilEnd(sim, 200);
    const spawn = events.find((e) => e.kind === 'spawn' && e.id === 2);
    const leak = events.find((e) => e.kind === 'leak');
    expect((leak?.tick ?? 0) - (spawn?.tick ?? 0)).toBe(59);
  });

  it('the Ancient reaching 0 emits death then end, and gameplay stops', () => {
    const sim = new Sim({ seed: 1, game: shortGame(3, 2) });
    const events = runUntilEnd(sim, 400);
    const tail = events.filter((e) => e.kind === 'leak' || e.kind === 'death' || e.kind === 'end');
    expect(tail.map((e) => e.kind)).toEqual(['leak', 'leak', 'death', 'end']);
    expect(tail.at(-2)).toMatchObject({ kind: 'death', id: 1, killer: 3 });
    expect(tail.at(-1)).toMatchObject({ kind: 'end', wave: 1, reason: 'ancient-destroyed' });
    expect(sim.ended).toBe(true);
    expect(sim.entities.get(1)).toBeUndefined();

    // Later ticks only count time and hash; new commands are rejected.
    const before = sim.entities.size;
    expect(sim.command(0, { kind: 'spawn', def: 'grunt', x: 0, y: 0 })).toEqual({ ok: false, reason: 'ended' });
    expect(sim.step()).toEqual([]);
    expect(sim.entities.size).toBe(before);
  });

  it('ends with victory when every wave has spawned and nothing is left', () => {
    const sim = new Sim({ seed: 1, game: shortGame(1, 10) });
    const events = runUntilEnd(sim, 200);
    expect(events.at(-1)).toMatchObject({ kind: 'end', reason: 'victory', wave: 1 });
  });

  it('keeps hashing after the end', () => {
    const sim = new Sim({ seed: 1, game: shortGame(1, 10), hashEvery: 10 });
    runUntilEnd(sim, 200);
    const later = Array.from({ length: 20 }, () => sim.step()).flat();
    expect(later.map((e) => e.kind)).toEqual(['hash', 'hash']);
  });
});
