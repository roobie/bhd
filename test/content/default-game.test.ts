import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { findById } from '../../src/content/types.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';

/** Generous bound: the last wave starts at ~285 s and the slowest enemy needs ~72 s to walk the lane. */
const MAX_TICKS = 30 * 400;

function runHeadless(seed: number): { events: SimEvent[]; sim: Sim } {
  // A sturdy Ancient: with no commands, leaks must not end the run before every wave has played.
  const base = defaultGame();
  const game = { ...base, map: { ...base.map, ancient: { ...base.map.ancient, maxHp: 100_000 } } };
  const sim = new Sim({ seed, game });
  const events: SimEvent[] = [];
  for (let i = 0; i < MAX_TICKS && !sim.ended; i++) {
    events.push(...sim.step());
  }
  return { events, sim };
}

describe('defaultGame', () => {
  it('has a 4-hero lineup: one gunner and three stand-ins', () => {
    const g = defaultGame();
    expect(g.heroes.map((h) => [h.id, h.kit])).toEqual([
      ['gunner', 'gunner'],
      ['tank', 'standin'],
      ['ranged', 'standin'],
      ['support', 'standin'],
    ]);
  });

  it('defines the roster, statuses and unique ids', () => {
    const g = defaultGame();
    expect(g.enemies.map((e) => e.id)).toEqual(['runner', 'grunt', 'brute', 'boss']);
    expect(g.statuses.map((s) => s.id)).toEqual(['suppressed', 'marked', 'exposed', 'clumped', 'taunted', 'rooted']);
    const heroIds = g.heroes.map((h) => h.id);
    expect(new Set([...heroIds, ...g.enemies.map((e) => e.id)]).size).toBe(heroIds.length + g.enemies.length);
  });

  it('only schedules enemies that exist, and the lane ends at the Ancient', () => {
    const g = defaultGame();
    for (const w of g.waves.waves) {
      for (const group of w.spawns) {
        expect(findById(g.enemies, group.def)).toBeDefined();
      }
    }
    expect(g.map.lane.at(-1)).toMatchObject({ x: g.map.ancient.x, y: g.map.ancient.y });
  });

  it('returns a fresh object each call', () => {
    expect(defaultGame()).not.toBe(defaultGame());
    expect(defaultGame()).toEqual(defaultGame());
  });
});

describe('headless defaultGame', () => {
  it('runs with no commands to an end event within a bounded number of ticks', () => {
    const { events, sim } = runHeadless(1);
    const end = events.find((e) => e.kind === 'end');
    expect(end).toBeDefined();
    expect(end?.tick).toBeLessThan(MAX_TICKS);
    expect(sim.ended).toBe(true);
    expect(events.filter((e) => e.kind === 'end')).toHaveLength(1);
  });

  it('spawns every scheduled enemy and each is either killed or leaks', () => {
    const { events } = runHeadless(1);
    const g = defaultGame();
    const scheduled = g.waves.waves.reduce((n, w) => n + w.spawns.reduce((m, s) => m + s.count, 0), 0);
    const spawned = events.filter((e) => e.kind === 'spawn' && e.team === 1).length;
    const dead = events.filter((e) => e.kind === 'death' && e.id > 5).length;
    const leaked = events.filter((e) => e.kind === 'leak').length;
    expect(spawned).toBe(scheduled);
    expect(dead + leaked).toBe(spawned);
    const waveEvents = events.filter((e) => e.kind === 'wave');
    const numbers = g.waves.waves.map((_, i) => i + 1);
    expect(waveEvents.filter((e) => e.phase === 'start').map((e) => e.n)).toEqual(numbers);
    expect([...waveEvents.filter((e) => e.phase === 'end').map((e) => e.n)].sort((a, b) => a - b)).toEqual(numbers);
  });

  it('is repeatable', () => {
    expect(runHeadless(7).events).toEqual(runHeadless(7).events);
  });
});

describe('pillar smoke', () => {
  // Loose bounds that guard against an instant loss or a trivial win with no commands. Retune
  // consciously when balance changes; do not just widen them.
  it.each([1, 2, 3])('seed %i: no commands survives wave 3 and does not win', (seed) => {
    const sim = new Sim({ seed, game: defaultGame() });
    const events: SimEvent[] = [];
    for (let i = 0; i < MAX_TICKS && !sim.ended; i++) {
      events.push(...sim.step());
    }
    const wave3 = events.find((e) => e.kind === 'wave' && e.phase === 'start' && e.n === 3);
    expect(wave3).toBeDefined();
    const end = events.find((e) => e.kind === 'end');
    expect(end?.tick ?? Number.POSITIVE_INFINITY).toBeGreaterThan(wave3?.tick ?? 0);
    expect(events.some((e) => e.kind === 'end' && e.reason === 'victory')).toBe(false);
  });
});
