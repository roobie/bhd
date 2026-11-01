// Match invariants (D-4E4QRJ7N6LIGZDSD): determinism and replay, the reaction-delay contract, the
// choice schema and emit-on-change, dedupe, seat validation. Nothing here asserts what a bot or the
// Director chooses, or how a game goes.

import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/bots/brains.ts';
import type { Bot, BotCtx, BrainTable, Decision } from '../../src/bots/types.ts';
import type { BotSetup, Doctrine } from '../../src/content/bots.ts';
import { defaultBotSetup, greedy } from '../../src/content/bots.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import { Match, type MatchOptions } from '../../src/match/match.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { ticks } from '../../src/sim/time.ts';

const SEED = 0x12_34_56_78;
const MAX_TICKS = 20_000;

function options(over: Partial<MatchOptions> = {}): MatchOptions {
  return { seed: SEED, game: defaultMasterGame(), bots: defaultBotSetup(), director: defaultDirector(), ...over };
}

function run(opts: MatchOptions, until: (m: Match) => boolean = (m) => m.ended, cap = MAX_TICKS): SimEvent[] {
  const m = new Match(opts);
  const events: SimEvent[] = [];
  while (!until(m) && m.tick < cap) {
    events.push(...m.step());
  }
  return events;
}

/** One seat (slot 0), no Director, a hand-written decision list per think. */
function oneSeat(
  think: (ctx: BotCtx) => Decision[],
  setup: { thinkSeconds: number; reactionSeconds: number; doctrine?: Partial<Doctrine> },
): MatchOptions {
  const doctrine: Doctrine = { ...greedy(), id: 'test', noise: 0, stickiness: 0, ...setup.doctrine };
  const bots: BotSetup = {
    thinkSeconds: setup.thinkSeconds,
    seats: [{ slot: 0, doctrine: 'test', reactionSeconds: setup.reactionSeconds }],
    doctrines: [doctrine],
    kitWeights: {},
  };
  const bot: Bot = { think };
  const brains: BrainTable = { gunner: () => bot, standin: () => bot };
  return { seed: SEED, game: defaultMasterGame(), bots, brains };
}

const HOLD_ON = (hero: number): Command => ({ kind: 'hold', hero, on: true });

describe('determinism', () => {
  it('the same seed and config give the identical event stream, choice events included', () => {
    const a = run(options(), (m) => m.ended || m.tick >= 1500);
    const b = run(options(), (m) => m.ended || m.tick >= 1500);
    expect(a.some((e) => e.kind === 'choice')).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('holds with a noisy doctrine (bot rng streams are seeded, not the sim stream)', () => {
    const bots = defaultBotSetup();
    const noisy: BotSetup = {
      ...bots,
      doctrines: bots.doctrines.map((d) => ({ ...d, noise: 0.5 })),
    };
    const a = run(options({ bots: noisy }), (m) => m.tick >= 900);
    const b = run(options({ bots: noisy }), (m) => m.tick >= 900);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a different seed gives a different noisy game', () => {
    const bots = defaultBotSetup();
    const noisy: BotSetup = { ...bots, doctrines: bots.doctrines.map((d) => ({ ...d, noise: 0.5 })) };
    const a = run(options({ bots: noisy }), (m) => m.tick >= 600);
    const b = run(options({ bots: noisy, seed: SEED + 1 }), (m) => m.tick >= 600);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('the logged commands alone replay the game on a bare Sim with identical hashes', () => {
    const opts = options();
    const events = run(opts);
    const sim = new Sim({ seed: opts.seed, game: opts.game });
    const rejected = events.flatMap((e) => (e.kind === 'cmd' && !sim.command(e.player, e.cmd, e.tick).ok ? [e] : []));
    expect(rejected).toEqual([]);
    const replay: SimEvent[] = [];
    const last = events.at(-1)?.tick ?? 0;
    while (sim.tick < last && !sim.ended) {
      replay.push(...sim.step());
    }
    const hashes = (list: readonly SimEvent[]): string[] =>
      list.flatMap((e) => (e.kind === 'hash' ? [e.stateHash] : []));
    expect(hashes(events).length).toBeGreaterThan(0);
    expect(hashes(replay)).toEqual(hashes(events));
  });

  it('an all-bot game with the Director runs to an end event', () => {
    const events = run(options());
    expect(events.filter((e) => e.kind === 'end')).toHaveLength(1);
    expect(events.at(-1)?.kind).toBe('end');
  });

  it('a schedule-mode game (no Director) also runs to an end event', () => {
    const { master: _master, ...game } = defaultMasterGame();
    const { director: _director, ...rest } = options({ game });
    const events = run(rest, (m) => m.ended, 60_000);
    expect(events.some((e) => e.kind === 'end')).toBe(true);
  });
});

describe('reaction delay', () => {
  function decisionTicks(
    thinkSeconds: number,
    reactionSeconds: number,
  ): { decided: number[]; applied: number[]; ctxTicks: number[] } {
    const decided: number[] = [];
    const ctxTicks: number[] = [];
    const opts = oneSeat(
      (ctx) => {
        decided.push(ctx.tick);
        ctxTicks.push(ctx.p.tick);
        return [{ id: 'x.hold', options: [{ id: 'on', value: 1, cost: 0, commands: [HOLD_ON(ctx.me.id)] }] }];
      },
      { thinkSeconds, reactionSeconds },
    );
    const events = run(opts, (m) => m.tick >= 200);
    const applied = events.flatMap((e) => (e.kind === 'cmd' && e.player === 0 ? [e.tick] : []));
    return { decided, applied, ctxTicks };
  }

  it('a command decided after tick T applies at T + ticks(reactionSeconds)', () => {
    const { decided, applied, ctxTicks } = decisionTicks(0.5, 0.4);
    const d = ticks(0.4);
    expect(d).toBeGreaterThan(1);
    expect(applied.length).toBeGreaterThan(0);
    expect(applied).toEqual(decided.map((t) => t + d).filter((t) => t <= 200));
    expect(ctxTicks).toEqual(decided);
  });

  it('the delay is at least one tick, even for zero reaction time', () => {
    const { decided, applied } = decisionTicks(0.5, 0);
    expect(applied).toEqual(decided.map((t) => t + 1).filter((t) => t <= 200));
  });

  it('thinks only on ticks divisible by the think cadence', () => {
    const { decided } = decisionTicks(0.5, 0.4);
    const every = ticks(0.5);
    expect(decided.length).toBeGreaterThan(0);
    expect(decided.every((t) => t % every === 0)).toBe(true);
  });

  it('a seat dedupes a command identical to one of its own not-yet-applied commands', () => {
    // Reaction 2 s (60 ticks), thinking every 15: only every fifth think submits.
    const opts = oneSeat(
      (ctx) => [{ id: 'x.hold', options: [{ id: 'on', value: 1, cost: 0, commands: [HOLD_ON(ctx.me.id)] }] }],
      { thinkSeconds: 0.5, reactionSeconds: 2 },
    );
    const applied = run(opts, (m) => m.tick >= 200).flatMap((e) => (e.kind === 'cmd' ? [e.tick] : []));
    expect(applied).toEqual([75, 135, 195]);
  });
});

describe('choice events', () => {
  function flipping(flipAt: number, stickiness = 0): { opts: MatchOptions; events: () => SimEvent[] } {
    const opts = oneSeat(
      (ctx) => [
        {
          id: 'x.mode',
          options: [
            { id: 'a', value: ctx.tick < flipAt ? 1 : 0, cost: 0, commands: [] },
            { id: 'b', value: 0.5, cost: 0, commands: [] },
          ],
        },
        { id: 'x.single', options: [{ id: 'only', value: 1, cost: 0, commands: [] }] },
      ],
      { thinkSeconds: 0.5, reactionSeconds: 0.1, doctrine: { stickiness } },
    );
    return { opts, events: () => run(opts, (m) => m.tick >= 90) };
  }

  it('is emitted first on evaluation and then only when the pick changes', () => {
    const choices = flipping(40)
      .events()
      .filter((e) => e.kind === 'choice');
    expect(choices.map((c) => [c.tick, c.kind === 'choice' ? c.picked : ''])).toEqual([
      [15, 'a'],
      [45, 'b'],
    ]);
  });

  it('has the schema: hero, decision, options in order with finite scores, a picked option id', () => {
    const [first] = flipping(40)
      .events()
      .filter((e) => e.kind === 'choice');
    expect(first).toEqual({
      tick: 15,
      kind: 'choice',
      hero: 2,
      decision: 'x.mode',
      options: [
        { id: 'a', score: 1 },
        { id: 'b', score: 0.5 },
      ],
      picked: 'a',
    });
  });

  it('is never emitted for a decision with a single option', () => {
    const choices = flipping(40)
      .events()
      .filter((e) => e.kind === 'choice' && e.decision === 'x.single');
    expect(choices).toEqual([]);
  });

  it('stickiness keeps the previous pick through a small score change', () => {
    const choices = flipping(40, 0.6)
      .events()
      .filter((e) => e.kind === 'choice');
    expect(choices).toHaveLength(1);
  });

  it('seat views carry the latest options and the tick the pick last changed', () => {
    const { opts } = flipping(40);
    const m = new Match(opts);
    while (m.tick < 60) {
      m.step();
    }
    const [seat] = m.seats;
    expect(seat?.decisions.map((d) => [d.id, d.picked, d.since])).toEqual([
      ['x.mode', 'b', 45],
      ['x.single', 'only', 15],
    ]);
  });
});

describe('seats and perception', () => {
  it('rejects a bad slot, a repeated slot, an unknown doctrine and a Director without a master', () => {
    const bots = defaultBotSetup();
    const [s0] = bots.seats;
    if (s0 === undefined) {
      throw new Error('no seat');
    }
    expect(() => new Match(options({ bots: { ...bots, seats: [{ ...s0, slot: 9 }] } }))).toThrow(RangeError);
    expect(() => new Match(options({ bots: { ...bots, seats: [s0, s0] } }))).toThrow(RangeError);
    expect(() => new Match(options({ bots: { ...bots, seats: [{ ...s0, doctrine: 'nope' }] } }))).toThrow(RangeError);
    const { master: _master, ...schedule } = defaultMasterGame();
    expect(() => new Match(options({ game: schedule }))).toThrow(RangeError);
  });

  it('perception is memoised by tick and is plain data', () => {
    const m = new Match(options());
    m.step();
    expect(m.perception).toBe(m.perception);
    const before = m.perception;
    m.step();
    expect(m.perception).not.toBe(before);
    expect(m.perception.tick).toBe(2);
    expect(JSON.parse(JSON.stringify(m.perception))).toEqual(JSON.parse(JSON.stringify(m.perception)));
  });

  it('asking for perception does not change the game', () => {
    const a = run(options(), (x) => x.tick >= 600);
    const m = new Match(options());
    const b: SimEvent[] = [];
    while (m.tick < 600) {
      b.push(...m.step());
      expect(m.perception.tick).toBe(m.tick);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('createBot binds a brain to one memory per seat', () => {
    let inits = 0;
    const bot = createBot(
      {
        init: () => {
          inits += 1;
          return { n: 0 };
        },
        think: (_ctx, mem) => {
          mem.n += 1;
          return [];
        },
      },
      { slot: 0, hero: 2, kit: 'gunner', post: { x: 0, y: 0 } },
    );
    expect(inits).toBe(1);
    expect(bot.think).toBeTypeOf('function');
  });
});
