// Psyker brain invariants: determinism, purity, legal commands for the seat hero. Nothing here
// asserts what the bot picks or how a game goes.

import { describe, expect, it } from 'vitest';
import { createBot, defaultBrains } from '../../src/bots/brains.ts';
import { psykerBrain } from '../../src/bots/psyker.ts';
import type { Bot, BotCtx, BrainTable, Decision, SeatInfo } from '../../src/bots/types.ts';
import { psykerWeights } from '../../src/content/bots/psyker.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import { Match } from '../../src/match/match.ts';
import { type Command, canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';

const SEED = 0x2c_0f_fe_e1;
const TICKS = 3600;

interface Think {
  readonly seat: SeatInfo;
  readonly ctx: BotCtx;
  readonly out: Decision[];
}

function play(): { thinks: Think[]; events: string } {
  const thinks: Think[] = [];
  const defaults = defaultBrains();
  const brains: BrainTable = {
    ...defaults,
    psyker: (seat): Bot => {
      const bot = createBot(psykerBrain, seat);
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
  const m = new Match({
    seed: SEED,
    game: defaultMasterGame(),
    bots: defaultBotSetup(),
    director: defaultDirector(),
    brains,
  });
  const events: unknown[] = [];
  while (!m.ended && m.tick < TICKS) {
    events.push(...m.step());
  }
  return { thinks, events: JSON.stringify(events) };
}

function commandsOf(t: Think): Command[] {
  const options = t.out.flatMap((d) => d.options);
  return options.flatMap((o) => [...o.commands]);
}

describe('psyker brain', () => {
  const a = play();

  it('is deterministic', () => {
    expect(a.thinks.length).toBeGreaterThan(0);
    const b = play();
    expect(a.events).toBe(b.events);
  });

  it('is pure and does not mutate its context', () => {
    for (const t of a.thinks) {
      const ctx = structuredClone(t.ctx);
      const again = createBot(psykerBrain, t.seat).think(ctx);
      expect(ctx).toStrictEqual(t.ctx);
      expect(again).toStrictEqual(t.out);
    }
  });

  it('emits well-formed decisions with unique ids and options', () => {
    for (const t of a.thinks) {
      expect(new Set(t.out.map((d) => d.id)).size).toBe(t.out.length);
      for (const d of t.out) {
        expect(d.id.startsWith('psyker.')).toBe(true);
        expect(d.options.length).toBeGreaterThan(0);
        expect(new Set(d.options.map((o) => o.id)).size).toBe(d.options.length);
        expect(d.options.every((o) => Number.isFinite(o.value) && Number.isFinite(o.cost))).toBe(true);
      }
    }
  });

  it('only issues legal canonical commands for the seat hero, and casts only ready abilities', () => {
    const cmds = a.thinks.flatMap((t) => commandsOf(t).map((c) => ({ t, c })));
    expect(cmds.length).toBeGreaterThan(0);
    for (const { c } of cmds) {
      expect(isValidCommand(c)).toBe(true);
      expect(canonicalCommand(c)).toStrictEqual(c);
    }
    expect(cmds.every(({ t, c }) => 'hero' in c && c.hero === t.ctx.me.id)).toBe(true);
    const casts = cmds.filter(({ c }) => c.kind === 'ability');
    expect(
      casts.every(({ t, c }) => c.kind === 'ability' && t.ctx.me.abilities.some((x) => x.slot === c.slot && x.ready)),
    ).toBe(true);
  });

  it('weights are data: absent kit weights fall back to the content defaults', () => {
    expect(Object.keys(psykerWeights()).every((k) => k.startsWith('psyker.'))).toBe(true);
    const bare = createBot(psykerBrain, a.thinks[0]?.seat as SeatInfo);
    const t = a.thinks[0] as Think;
    expect(bare.think({ ...structuredClone(t.ctx), weights: {} })).toStrictEqual(t.out);
  });
});
