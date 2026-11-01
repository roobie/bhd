import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { findById } from '../../src/content/types.ts';
import { Sim } from '../../src/sim/sim.ts';
import { ticks } from '../../src/sim/time.ts';
import { heldSim, oneWave, stepUntil } from './rig.ts';

describe('default content', () => {
  it('has a lane that bends, ends at the Ancient, and spawn points for the lineup', () => {
    const g = defaultGame();
    const { lane } = g.map;
    expect(new Set(lane.map((p) => p.x)).size).toBeGreaterThan(2);
    expect(new Set(lane.map((p) => p.y)).size).toBeGreaterThan(2);
    expect(lane.at(-1)).toMatchObject({ x: g.map.ancient.x, y: g.map.ancient.y });
    expect(g.map.ancient.maxHp).toBeGreaterThan(0);
    expect(g.map.heroSpawns.length).toBeGreaterThanOrEqual(g.heroes.length);
    for (const p of [...lane, ...g.map.heroSpawns]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(g.map.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(g.map.height);
    }
  });

  it('has a fast fragile Runner, a baseline Grunt, a slow armoured Brute and a Boss', () => {
    const { enemies } = defaultGame();
    const [runner, grunt, brute, boss] = ['runner', 'grunt', 'brute', 'boss'].map((id) => findById(enemies, id));
    if (runner === undefined || grunt === undefined || brute === undefined || boss === undefined) {
      throw new Error('roster');
    }
    expect(runner.speed).toBeGreaterThan(grunt.speed);
    expect(runner.maxHp).toBeLessThan(grunt.maxHp);
    expect(brute.speed).toBeLessThan(grunt.speed);
    expect(brute.armour).toBeGreaterThanOrEqual(5 * grunt.armour);
    expect(brute.armour).toBeGreaterThan(5);
    expect(boss.maxHp).toBeGreaterThan(brute.maxHp);
    expect(boss.leakDamage).toBeGreaterThan(brute.leakDamage);
  });

  it('puts a Boss in every 5th wave and only there, and escalates', () => {
    const { waves } = defaultGame().waves;
    expect(waves.length).toBeGreaterThanOrEqual(10);
    expect(waves.length % 5).toBe(0);
    const total = (w: (typeof waves)[number]): number => w.spawns.reduce((n, s) => n + s.count, 0);
    waves.forEach((w, i) => {
      const hasBoss = w.spawns.some((s) => s.def === 'boss');
      expect(hasBoss).toBe((i + 1) % 5 === 0);
    });
    expect(total(waves.at(-1) ?? { spawns: [] })).toBeGreaterThan(total(waves[0] ?? { spawns: [] }) * 3);
  });
});

describe('wave schedule', () => {
  it('wave n starts at firstDelay + (n - 1) * interval, and emits its composition', () => {
    const game = defaultGame();
    const sim = new Sim({ seed: 1, game: { ...game, heroes: [] } });
    const events = stepUntil(sim, () => sim.tick >= ticks(game.waves.firstDelay + 2 * game.waves.interval) + 1);
    const starts = events.filter((e) => e.kind === 'wave' && e.phase === 'start');
    expect(starts.map((e) => [e.kind === 'wave' ? e.n : 0, e.tick])).toEqual([
      [1, ticks(game.waves.firstDelay)],
      [2, ticks(game.waves.firstDelay + game.waves.interval)],
      [3, ticks(game.waves.firstDelay + 2 * game.waves.interval)],
    ]);
    expect(starts[0]).toMatchObject({ composition: [{ def: 'grunt', count: 5 }] });
    expect(starts[1]).toMatchObject({
      composition: [
        { def: 'runner', count: 6 },
        { def: 'grunt', count: 3 },
      ],
    });
  });

  it('releases a group`s units `gap` seconds apart at the lane start', () => {
    const sim = heldSim(oneWave('grunt', 3, 2));
    const events = stepUntil(sim, () => sim.tick > 200);
    const spawns = events.filter((e) => e.kind === 'spawn' && e.team === 1);
    expect(spawns.map((e) => e.tick)).toEqual([30, 90, 150]);
  });
});

describe('wave end', () => {
  it('fires after every unit has spawned and is gone (leaked), with the composition', () => {
    const sim = heldSim(oneWave('grunt', 2), 10);
    const events = stepUntil(sim, (ev) => ev.some((e) => e.kind === 'wave' && e.phase === 'end'));
    const leaks = events.filter((e) => e.kind === 'leak');
    const end = events.find((e) => e.kind === 'wave' && e.phase === 'end');
    expect(leaks).toHaveLength(2);
    expect(end).toMatchObject({ n: 1, phase: 'end', composition: [{ def: 'grunt', count: 2 }] });
    expect(end?.tick).toBe((leaks.at(-1)?.tick ?? 0) + 1);
  });

  it('fires when the last unit is killed, not before', () => {
    const sim = heldSim(oneWave('grunt', 2), 10);
    const events = stepUntil(sim, () => sim.entities.size >= 6);
    expect(events.some((e) => e.kind === 'wave' && e.phase === 'end')).toBe(false);
    for (const id of [5, 6]) {
      const e = sim.entities.get(id);
      if (e !== undefined) {
        e.hp = 0;
      }
    }
    const after = stepUntil(sim, (ev) => ev.some((e) => e.kind === 'wave' && e.phase === 'end'), 10);
    expect(after.filter((e) => e.kind === 'death')).toHaveLength(2);
    expect(after.filter((e) => e.kind === 'wave' && e.phase === 'end')).toHaveLength(1);
  });

  it('does not wait for later waves, and victory follows the last wave end', () => {
    const group = { spawns: [{ def: 'runner', count: 1, gap: 0 }] };
    const sim = heldSim({ firstDelay: 1, interval: 5, waves: [group, group] }, 50);
    const events = stepUntil(sim, () => false);
    const marks = events.flatMap((e) => {
      if (e.kind === 'wave') {
        return [`${e.phase}:${e.n}`];
      }
      return e.kind === 'end' ? [`end:${e.reason}`] : [];
    });
    // Runner: 60 units at 7/s takes ~8.6 s, so wave 2 (5 s later) starts before wave 1 is over.
    expect(marks).toEqual(['start:1', 'start:2', 'end:1', 'end:2', 'end:victory']);
  });
});
