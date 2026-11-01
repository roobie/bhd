// Stand-in brain invariants (D-4E4QRJ7N6LIGZDSD): determinism, command shapes, reads nothing beyond
// BotCtx, weights as data. Nothing here asserts what a bot picks or how a game goes.

import { describe, expect, it } from 'vitest';
import { createBot, defaultBrains } from '../../src/bots/brains.ts';
import { standinBrain } from '../../src/bots/standins.ts';
import type { Bot, BotCtx, BrainTable, Decision, SeatInfo } from '../../src/bots/types.ts';
import { standinWeights } from '../../src/content/bots/standins.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import { Match, type MatchOptions } from '../../src/match/match.ts';
import { canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';

const SEED = 0x2c_0f_fe_e1;
const TICKS = 2400;

interface Think {
  readonly seat: SeatInfo;
  readonly ctx: BotCtx;
  readonly out: Decision[];
}

function options(brains: BrainTable, over: Partial<MatchOptions>): MatchOptions {
  return {
    seed: SEED,
    game: defaultMasterGame(),
    bots: defaultBotSetup(),
    director: defaultDirector(),
    brains,
    ...over,
  };
}

/** Plays a Match whose stand-in seats record every think (with a private copy of the ctx). */
function play(over: Partial<MatchOptions> = {}): { thinks: Think[]; events: string } {
  const thinks: Think[] = [];
  const defaults = defaultBrains();
  const brains: BrainTable = {
    gunner: defaults.gunner,
    penitent: defaults.penitent,
    psyker: defaults.psyker,
    standin: (seat): Bot => {
      const bot = createBot(standinBrain, seat);
      return {
        think: (ctx) => {
          const copy = structuredClone(ctx);
          const out = bot.think(ctx);
          thinks.push({ seat, ctx: copy, out });
          return out;
        },
      };
    },
  };
  const m = new Match(options(brains, over));
  const events: unknown[] = [];
  while (!m.ended && m.tick < TICKS) {
    events.push(...m.step());
  }
  return { thinks, events: JSON.stringify(events) };
}

function greedyBots(): MatchOptions['bots'] {
  const base = defaultBotSetup();
  return { ...base, seats: base.seats.map((s) => ({ ...s, doctrine: 'greedy' })) };
}

describe('standin brain', () => {
  it('the same seed and config give identical games and identical decisions', () => {
    const a = play();
    const b = play();
    expect(a.thinks.length).toBeGreaterThan(0);
    expect(a.events).toBe(b.events);
    expect(JSON.stringify(a.thinks.map((t) => t.out))).toBe(JSON.stringify(b.thinks.map((t) => t.out)));
  });

  it('is a pure function of BotCtx: a fresh bot on a copy of each ctx decides the same', () => {
    for (const bots of [defaultBotSetup(), greedyBots()]) {
      for (const t of play({ bots }).thinks) {
        const again = createBot(standinBrain, t.seat).think(structuredClone(t.ctx));
        expect(again).toStrictEqual(t.out);
      }
    }
  });

  it('does not mutate its context', () => {
    for (const t of play().thinks) {
      const ctx = structuredClone(t.ctx);
      createBot(standinBrain, t.seat).think(ctx);
      expect(ctx).toStrictEqual(t.ctx);
    }
  });

  it('emits well-formed decisions and only valid canonical commands for the seat hero, in every option', () => {
    const { thinks } = play({ bots: greedyBots() });
    for (const t of thinks) {
      const seen = new Set<string>();
      for (const d of t.out) {
        expect(d.id.startsWith(`standin.${t.ctx.me.role}.`)).toBe(true);
        expect(seen.has(d.id)).toBe(false);
        seen.add(d.id);
        expect(d.options.length).toBeGreaterThan(0);
        expect(new Set(d.options.map((o) => o.id)).size).toBe(d.options.length);
        for (const o of d.options) {
          expect(Number.isFinite(o.value)).toBe(true);
          expect(Number.isFinite(o.cost)).toBe(true);
          for (const c of o.commands) {
            expect(isValidCommand(c)).toBe(true);
            expect(canonicalCommand(c)).toStrictEqual(c);
            expect('hero' in c && c.hero === t.ctx.me.id).toBe(true);
          }
        }
      }
    }
  });

  it('weights are data: absent kit weights fall back to the content defaults', () => {
    const full = play();
    const bare = play({ bots: { ...defaultBotSetup(), kitWeights: {} } });
    expect(bare.events).toBe(full.events);
    expect(Object.keys(standinWeights()).every((k) => k.startsWith('standin.'))).toBe(true);
  });
});
