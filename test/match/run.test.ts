// run.ts invariants: a spec determines the game, the viewer builds through it, the ABI is checked.
// Nothing here asserts what a bot or the Director chooses, or how a game goes.

import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/client/config.ts';
import { buildMatch as buildViewerMatch, configFromSpec, specFromConfig } from '../../src/client/setup.ts';
import type { GameSpec } from '../../src/match/run.ts';
import { buildMatch, RUN_ABI, runGame } from '../../src/match/run.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SHORT = 600;

function spec(over: Partial<GameSpec> = {}): GameSpec {
  return { ...specFromConfig({ ...defaultConfig(), seed: 11 }), maxTicks: SHORT, ...over };
}

describe('runGame', () => {
  it.each(['director', 'schedule'] as const)('the same %s spec twice gives identical events', (mode) => {
    const a = runGame(spec({ mode }));
    const b = runGame(spec({ mode }));
    expect(b.events).toEqual(a.events);
    expect(b.end).toEqual(a.end);
    expect(b.ticks).toBe(a.ticks);
  });

  it('stops at maxTicks and says so', () => {
    const r = runGame(spec({ maxTicks: 5 }));
    expect(r.ticks).toBe(5);
    expect(r.end.reason === 'maxTicks' || r.events.some((e) => e.kind === 'end')).toBe(true);
  });

  it('resolves a Director only in director mode', () => {
    expect(runGame(spec({ mode: 'director', maxTicks: 1 })).resolved.director).toBeDefined();
    expect(runGame(spec({ mode: 'schedule', maxTicks: 1 })).resolved.director).toBeUndefined();
  });

  it('applies overrides to the resolved config', () => {
    const r = runGame(spec({ maxTicks: 1, overrides: { bots: { thinkSeconds: 1 } } }));
    expect(r.resolved.bots.thinkSeconds).toBe(1);
  });

  it('rejects a foreign ABI and a malformed spec', () => {
    expect(() => runGame(spec({ abi: RUN_ABI + 1 }))).toThrow(RangeError);
    expect(() => runGame(spec({ doctrines: ['greedy'] }))).toThrow(RangeError);
    expect(() => runGame(spec({ maxTicks: 0 }))).toThrow(RangeError);
  });
});

describe('the viewer and the runner build the same Match', () => {
  it("the viewer's default spec goes through runGame", () => {
    const cfg = defaultConfig();
    const viewer = buildViewerMatch(cfg);
    const events: SimEvent[] = [];
    for (let i = 0; i < SHORT; i++) {
      events.push(...viewer.step());
    }
    const run = runGame({ ...specFromConfig(cfg), maxTicks: SHORT });
    expect(run.events.slice(0, events.length)).toEqual(events);
  });

  it('buildMatch(spec) steps like the viewer', () => {
    const s = spec();
    const m = buildMatch(s);
    expect(m.tick).toBe(0);
    expect(m.step()).toEqual(buildViewerMatch(configFromSpec(s)).step());
  });

  it('spec and viewer config map back and forth', () => {
    const cfg = {
      ...defaultConfig(),
      seed: 99,
      mode: 'schedule' as const,
      doctrines: ['greedy', 'greedy', 'greedy', 'greedy'],
    };
    expect(configFromSpec(specFromConfig(cfg))).toEqual(cfg);
  });
});

describe('humans', () => {
  it('leaves no bot seat for a human slot, and no bot command comes from its player', () => {
    const m = buildMatch(spec({ humans: [0, 2] }));
    expect(m.seats.map((x) => x.slot)).toEqual([1, 3]);
    const r = runGame(spec({ humans: [0, 2], maxTicks: 900 }));
    const players = new Set(r.events.flatMap((e) => (e.kind === 'cmd' ? [e.player] : [])));
    expect(players.has(0)).toBe(false);
    expect(players.has(2)).toBe(false);
  });

  it('an empty list is the same game as an absent one', () => {
    expect(runGame(spec({ humans: [] })).events).toEqual(runGame(spec()).events);
  });

  it('rejects slots outside 0-3, duplicates and non-integers', () => {
    for (const humans of [[4], [-1], [1, 1], [0.5]]) {
      expect(() => buildMatch(spec({ humans }))).toThrow(RangeError);
    }
  });

  it('a driven slot takes commands through sim.command like any player', () => {
    const m = buildMatch(spec({ humans: [0] }));
    const [hero] = m.perception.heroes;
    expect(hero).toBeDefined();
    m.sim.command(0, { kind: 'move', hero: hero?.id ?? 0, x: 10, y: 10 }, m.tick + 3);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      for (const e of m.step()) {
        if (e.kind === 'cmd' && e.player === 0) {
          seen.push(e.tick);
        }
      }
    }
    expect(seen).toEqual([3]);
  });
});
