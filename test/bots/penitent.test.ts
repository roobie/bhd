// Penitent brain invariants: determinism, legal command shapes, well-formed decisions, a pull intent
// on the board still yields valid commands. Nothing here asserts which option the brain picks.

import { describe, expect, it } from 'vitest';
import { createBot, defaultBrains } from '../../src/bots/brains.ts';
import { penitentBrain } from '../../src/bots/penitent.ts';
import type { Bot, BotCtx, Decision, SeatInfo } from '../../src/bots/types.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import { Match } from '../../src/match/match.ts';
import type { IntentView } from '../../src/perception/types.ts';
import { canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';

const SEED = 0x12_34_56_78;
const TICKS = 2400;

interface Sample {
  readonly ctx: BotCtx;
  readonly out: Decision[];
}

function record(): { samples: Sample[]; seat: SeatInfo | undefined } {
  const samples: Sample[] = [];
  let seat: SeatInfo | undefined;
  const base = defaultBrains();
  const brains = {
    ...base,
    penitent: (s: SeatInfo): Bot => {
      seat ??= s;
      const bot = base.penitent(s);
      return {
        think: (ctx) => {
          const before = structuredClone(ctx);
          const out = bot.think(ctx);
          samples.push({ ctx: before, out });
          return out;
        },
      };
    },
  };
  const m = new Match({
    seed: SEED,
    game: defaultMasterGame(),
    bots: defaultBotSetup(),
    director: defaultDirector(),
    brains,
  });
  while (!m.ended && m.tick < TICKS) {
    m.step();
  }
  return { samples, seat };
}

describe('penitent brain', () => {
  const { samples, seat } = record();

  it('thinks in a full game', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    if (seat === undefined) {
      return;
    }
    const a = createBot(penitentBrain, seat);
    const b = createBot(penitentBrain, seat);
    for (const s of samples) {
      expect(JSON.stringify(a.think(s.ctx))).toBe(JSON.stringify(b.think(s.ctx)));
    }
  });

  it('emits only legal, canonical commands and well-formed decisions', () => {
    for (const s of samples) {
      const ids = s.out.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of s.out) {
        expect(d.id.startsWith('penitent.')).toBe(true);
        expect(d.options.length).toBeGreaterThanOrEqual(2);
        expect(new Set(d.options.map((o) => o.id)).size).toBe(d.options.length);
        for (const o of d.options) {
          expect(Number.isFinite(o.value)).toBe(true);
          expect(Number.isFinite(o.cost)).toBe(true);
          for (const c of o.commands) {
            expect(isValidCommand(c)).toBe(true);
            expect(canonicalCommand(c)).toEqual(c);
          }
        }
      }
    }
  });

  it('with a pull intent on the board, still returns legal commands', () => {
    if (seat === undefined) {
      return;
    }
    const bot = createBot(penitentBrain, seat);
    for (const s of samples.slice(0, 200)) {
      const intent: IntentView = {
        id: 1,
        by: s.ctx.me.id + 1,
        intentKind: 'pull',
        x: s.ctx.me.x + 4,
        y: s.ctx.me.y,
        fireTick: s.ctx.tick + 90,
        fired: false,
        reservers: [],
      };
      const ctx: BotCtx = { ...s.ctx, p: { ...s.ctx.p, intents: [intent] } };
      for (const c of bot.think(ctx).flatMap((d) => d.options.flatMap((o) => o.commands))) {
        expect(isValidCommand(c)).toBe(true);
      }
    }
  });
});
