// Down / respawn accounting and the per-kit metrics, on small hand-built logs. Invariants and
// bookkeeping only: no tuned numbers or outcomes are asserted (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { GameEnd, GameSpec } from '../../src/match/run.ts';
import { RUN_ABI } from '../../src/match/run.ts';
import type { LogHeader } from '../../src/replay/log.ts';
import { buildIndex } from '../../src/reporter/metrics/gameindex.ts';
import { computeMetrics, METRICS } from '../../src/reporter/metrics/registry.ts';
import type { GameLog, MetricDef } from '../../src/reporter/types.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SPEC: GameSpec = {
  abi: RUN_ABI,
  seed: 1,
  mode: 'director',
  doctrines: ['hold-the-line', 'hold-the-line', 'greedy', 'greedy'],
  reactionSeconds: 0.4,
  thinkSeconds: 0.5,
  maxTicks: 1500,
  hashEvery: 30,
};

const END_TICK = 1000;

function logOf(events: SimEvent[]): GameLog {
  const end: GameEnd = { tick: END_TICK, wave: 2, reason: 'victory' };
  const header: LogHeader = {
    format: 'bhd-log',
    v: 1,
    abi: RUN_ABI,
    side: 'base',
    ref: 'x',
    sha: 'x',
    dirty: false,
    fingerprint: 'x',
    spec: SPEC,
    resolved: { game: defaultGame(), bots: defaultBotSetup() },
    end,
    ticks: end.tick,
  };
  return { header, events };
}

function metric(id: string): MetricDef {
  const m = METRICS.find((x) => x.id === id);
  if (m === undefined) {
    throw new Error(`no metric ${id}`);
  }
  return m;
}

// Entity ids: 1 ancient, 2 gunner, 3 penitent, 4 psyker, 5 support, 10 and 11 grunts.
const SPAWNS: SimEvent[] = [
  { tick: 0, kind: 'spawn', id: 1, def: 'ancient', team: 0 },
  { tick: 0, kind: 'spawn', id: 2, def: 'gunner', team: 0 },
  { tick: 0, kind: 'spawn', id: 3, def: 'penitent', team: 0 },
  { tick: 0, kind: 'spawn', id: 4, def: 'psyker', team: 0 },
  { tick: 0, kind: 'spawn', id: 5, def: 'support', team: 0 },
  { tick: 10, kind: 'spawn', id: 10, def: 'grunt', team: 1 },
  { tick: 10, kind: 'spawn', id: 11, def: 'grunt', team: 1 },
];

describe('down and respawn accounting', () => {
  const log = logOf([
    ...SPAWNS,
    { tick: 100, kind: 'death', id: 2, killer: 10 },
    { tick: 300, kind: 'respawn', id: 2 },
    { tick: 500, kind: 'death', id: 2, killer: 10 },
    { tick: 600, kind: 'respawn', id: 2 },
    { tick: 900, kind: 'death', id: 2, killer: 11 },
    { tick: 950, kind: 'death', id: 10, killer: 3 },
  ]);

  it('keeps every down of a hero and ends the last one at the game end', () => {
    const gunner = buildIndex(log).entities.get(2);
    expect(gunner?.downs).toEqual([
      { from: 100, to: 300 },
      { from: 500, to: 600 },
      { from: 900, to: undefined },
    ]);
  });

  it('counts deaths, respawns and total time down per hero', () => {
    expect(metric('hero.deaths').compute(log)).toMatchObject({ gunner: 3, penitent: 0 });
    expect(metric('hero.respawns').compute(log)).toMatchObject({ gunner: 2, penitent: 0 });
    expect(metric('hero.downtime').compute(log)).toMatchObject({
      gunner: 200 + 100 + (END_TICK - 900),
      penitent: 0,
    });
  });

  it('still removes an enemy for good on death', () => {
    const grunt = buildIndex(log).entities.get(10);
    expect(grunt?.deathTick).toBe(950);
    expect(grunt?.downs).toEqual([]);
  });

  it('brings team hp back at a respawn and keeps it in 0..1', () => {
    const ix = buildIndex(log);
    const at = (tick: number): number => {
      const i = log.events.findIndex((e) => e.tick === tick && (e.kind === 'death' || e.kind === 'respawn'));
      return ix.teamFrac[i] ?? Number.NaN;
    };
    expect(at(100)).toBeLessThan(1);
    expect(at(300)).toBe(1);
    for (const f of ix.teamFrac) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('does not heal or damage a downed hero, and counts heat band time only while up', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 100, kind: 'resource', hero: 2, resource: 'heat', band: 60 },
      { tick: 200, kind: 'death', id: 2, killer: 10 },
      { tick: 250, kind: 'heal', src: 5, dst: 2, amount: 50 },
      { tick: 260, kind: 'dmg', src: 10, dst: 2, amount: 50, tags: [] },
      { tick: 600, kind: 'respawn', id: 2 },
    ]);
    const heat = metric('gunner.heat.band').compute(l);
    const up = 200 + (END_TICK - 600);
    expect(heat.b0).toBeCloseTo(100 / up);
    expect(heat.b60).toBeCloseTo((100 + (END_TICK - 600)) / up);
    expect(Object.values(heat).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe('ultimate slots of the new kits', () => {
  it('reads casts of the penitent in slot 3 and of the psyker in slot 0 as their ultimates', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 50, kind: 'ability', hero: 3, slot: 0, target: 0, value: 0 },
      { tick: 60, kind: 'ability', hero: 3, slot: 3, target: 0, value: 0 },
      { tick: 70, kind: 'ability', hero: 4, slot: 0, target: 0, value: 0 },
    ]);
    const out = metric('ult.timing').compute(l);
    expect(out['penitent:casts']).toBe(1);
    expect(out['psyker:casts']).toBe(1);
  });
});

describe('penitent metrics', () => {
  const log = logOf([
    ...SPAWNS,
    { tick: 100, kind: 'dmg', src: 10, dst: 3, amount: 40, tags: ['melee'] },
    { tick: 120, kind: 'ability', hero: 3, slot: 3, target: 0, value: 0 },
    { tick: 130, kind: 'dmg', src: 10, dst: 3, amount: 20, tags: ['melee'] },
    { tick: 140, kind: 'dmg', src: 2, dst: 3, amount: 10, tags: ['ff'] },
    { tick: 600, kind: 'dmg', src: 3, dst: 10, amount: 70, tags: ['splash'] },
    { tick: 600, kind: 'dmg', src: 3, dst: 11, amount: 30, tags: ['splash'] },
    { tick: 600, kind: 'dmg', src: 3, dst: 2, amount: 5, tags: ['splash', 'ff'] },
    { tick: 610, kind: 'dmg', src: 3, dst: 10, amount: 3, tags: [] },
  ]);

  it('splits nova damage into enemies and allies and ignores basic attacks', () => {
    const nova = metric('penitent.nova').compute(log);
    expect(nova.enemies).toBeGreaterThan(0);
    expect(nova.allies).toBeGreaterThan(0);
    const all = Object.values(nova).reduce((a, b) => a + b, 0);
    expect(all).toBeLessThanOrEqual(70 + 30 + 5);
  });

  it('banks at least the hp lost, and spends no more than a finite amount', () => {
    const pain = metric('penitent.pain').compute(log);
    expect(pain.banked).toBeGreaterThanOrEqual(40 + 20 + 10);
    expect(Number.isFinite(pain.spent)).toBe(true);
    expect(pain.spent).toBeGreaterThanOrEqual(0);
  });

  it('spends the cast value when the kit fills it', () => {
    const l = logOf([...SPAWNS, { tick: 120, kind: 'ability', hero: 3, slot: 3, target: 0, value: 400 }]);
    expect(metric('penitent.pain').compute(l).spent).toBe(400);
  });

  it('is all zeros for a game without a penitent event', () => {
    expect(metric('penitent.pain').compute(logOf(SPAWNS))).toEqual({ banked: 0, spent: 0 });
    expect(metric('penitent.nova').compute(logOf(SPAWNS))).toEqual({ enemies: 0, allies: 0 });
  });
});

describe('psyker metrics', () => {
  it('measures the share of alive time with Warp at or above the threshold', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 200, kind: 'resource', hero: 4, resource: 'warp', band: 75 },
      { tick: 600, kind: 'resource', hero: 4, resource: 'warp', band: 0 },
    ]);
    expect(metric('psyker.warp.high').compute(l).high).toBeCloseTo(400 / END_TICK);
  });

  it('leaves out time spent down', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 200, kind: 'resource', hero: 4, resource: 'warp', band: 75 },
      { tick: 300, kind: 'death', id: 4, killer: 10 },
      { tick: 700, kind: 'respawn', id: 4 },
      { tick: 710, kind: 'resource', hero: 4, resource: 'warp', band: 0 },
    ]);
    const up = END_TICK - 400;
    expect(metric('psyker.warp.high').compute(l).high).toBeCloseTo(110 / up);
  });

  it('counts backlashes by tick and splits out friendly-fire damage', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 300, kind: 'dmg', src: 4, dst: 10, amount: 50, tags: ['ff', 'splash'] },
      { tick: 300, kind: 'dmg', src: 4, dst: 2, amount: 30, tags: ['ff', 'splash'] },
      { tick: 300, kind: 'dmg', src: 4, dst: 4, amount: 20, tags: ['ff', 'splash'] },
      { tick: 500, kind: 'dmg', src: 4, dst: 3, amount: 40, tags: ['backlash'] },
      { tick: 520, kind: 'dmg', src: 4, dst: 10, amount: 14, tags: [] },
      { tick: 530, kind: 'dmg', src: 3, dst: 2, amount: 9, tags: ['ff', 'splash'] },
    ]);
    const out = metric('psyker.backlash').compute(l);
    expect(out.count).toBe(2);
    expect(out.damage).toBeGreaterThan(0);
    expect(out.ffDamage).toBeGreaterThan(0);
    expect(out.ffDamage).toBeLessThanOrEqual(out.damage ?? 0);
  });

  it('has no warp series without a psyker', () => {
    expect(metric('psyker.warp.high').compute(logOf([SPAWNS[0] as SimEvent]))).toEqual({});
  });
});

/** `block` is not in `SimEvent` until integration; synthetic ones are cast in. */
function blocks(raw: readonly object[]): SimEvent[] {
  return raw as unknown as SimEvent[];
}

describe('gunner pavise', () => {
  it('counts casts in the pavise slot and `block` events', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 50, kind: 'ability', hero: 2, slot: 2, target: 0, value: 0 },
      { tick: 60, kind: 'ability', hero: 2, slot: 1, target: 0, value: 0 },
      { tick: 70, kind: 'ability', hero: 3, slot: 2, target: 0, value: 0 },
      ...blocks([
        { tick: 80, kind: 'block', src: 10, dst: 2, prop: 20 },
        { tick: 85, kind: 'block', src: 11, prop: 20 },
      ]),
      { tick: 90, kind: 'dmg', src: 10, dst: 2, amount: 5, tags: ['melee'] },
    ]);
    expect(metric('gunner.pavise').compute(l)).toEqual({ casts: 1, blocks: 2 });
  });
});

describe('every new metric is finite on a busy log', () => {
  it('has only finite values', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 100, kind: 'death', id: 3, killer: 10 },
      { tick: 200, kind: 'respawn', id: 3 },
      { tick: 300, kind: 'ability', hero: 3, slot: 3, target: 0, value: 0 },
      { tick: 300, kind: 'dmg', src: 3, dst: 10, amount: 1e9, tags: ['splash'] },
    ]);
    for (const [name, v] of Object.entries(computeMetrics(l))) {
      expect(Number.isFinite(v), name).toBe(true);
    }
  });
});
