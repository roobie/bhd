// Gunner brain invariants (D-4E4QRJ7N6LIGZDSD): determinism, command shapes, decision schema and
// reading only BotCtx. Nothing here asserts which option the brain picks.

import { describe, expect, it } from 'vitest';
import { createBot, defaultBrains } from '../../src/bots/brains.ts';
import { gunnerBrain } from '../../src/bots/gunner.ts';
import type { Bot, BotCtx, Decision } from '../../src/bots/types.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import { Match } from '../../src/match/match.ts';
import type { IntentView } from '../../src/perception/types.ts';
import { type Command, canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';

const SEED = 0x12_34_56_78;
const TICKS = 2400;

interface Sample {
  readonly ctx: BotCtx;
  readonly seat: Parameters<ReturnType<typeof defaultBrains>['gunner']>[0];
  readonly out: Decision[];
}

/** Runs an all-bot Match, recording every Gunner think (ctx cloned, as the bot saw it). */
function record(): { samples: Sample[]; first: Sample['seat'] | undefined } {
  const samples: Sample[] = [];
  let first: Sample['seat'] | undefined;
  const base = defaultBrains();
  const brains = {
    ...base,
    gunner: (seat: Sample['seat']): Bot => {
      first ??= seat;
      const bot = base.gunner(seat);
      return {
        think: (ctx) => {
          const before = structuredClone(ctx);
          const out = bot.think(ctx);
          samples.push({ ctx: before, seat, out });
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
  return { samples, first };
}

function commandsOf(ds: readonly Decision[]): Command[] {
  return ds.flatMap((d) => d.options.flatMap((o) => o.commands));
}

function abilityCommands(cmds: readonly Command[]): Extract<Command, { kind: 'ability' }>[] {
  return cmds.filter((c): c is Extract<Command, { kind: 'ability' }> => c.kind === 'ability');
}

function slotKey(c: Extract<Command, { kind: 'ability' }>): string {
  return `${c.hero}:${c.slot}`;
}

describe('gunner brain', () => {
  const { samples } = record();

  it('thinks at all in a full game', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same ctx sequence gives the same decisions', () => {
    const [head] = samples;
    expect(head).toBeDefined();
    if (head === undefined) {
      return;
    }
    const a = createBot(gunnerBrain, head.seat);
    const b = createBot(gunnerBrain, head.seat);
    for (const s of samples) {
      expect(JSON.stringify(a.think(s.ctx))).toBe(JSON.stringify(b.think(s.ctx)));
    }
  });

  it('emits only valid, canonical command shapes', () => {
    for (const s of samples) {
      for (const d of s.out) {
        for (const o of d.options) {
          for (const c of o.commands) {
            expect(isValidCommand(c)).toBe(true);
            expect(canonicalCommand(c)).toEqual(c);
          }
        }
      }
    }
  });

  it('emits well-formed decisions: gunner ids, unique, at least two distinct options, finite numbers', () => {
    for (const s of samples) {
      const ids = s.out.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of s.out) {
        expect(d.id.startsWith('gunner.')).toBe(true);
        expect(d.options.length).toBeGreaterThanOrEqual(2);
        expect(new Set(d.options.map((o) => o.id)).size).toBe(d.options.length);
        for (const o of d.options) {
          expect(Number.isFinite(o.value)).toBe(true);
          expect(Number.isFinite(o.cost)).toBe(true);
        }
      }
    }
  });

  it('reads only BotCtx: deep-frozen ctx in, ctx unchanged out, no throw', () => {
    const [head] = samples;
    if (head === undefined) {
      return;
    }
    const bot = createBot(gunnerBrain, head.seat);
    for (const s of samples) {
      const frozen = Object.freeze(structuredClone(s.ctx)) as BotCtx;
      const before = JSON.stringify(frozen);
      bot.think(frozen);
      expect(JSON.stringify(frozen)).toBe(before);
    }
  });

  it('with a pull intent on the board, still returns valid commands (reserve shape)', () => {
    const [head] = samples;
    if (head === undefined) {
      return;
    }
    const bot = createBot(gunnerBrain, head.seat);
    for (const s of samples.slice(0, 200)) {
      const intent: IntentView = {
        id: 1,
        by: s.ctx.me.id + 1,
        intentKind: 'pull',
        x: s.ctx.me.x + 4,
        y: s.ctx.me.y,
        fireTick: s.ctx.tick + 60,
        fired: false,
        reservers: [],
      };
      const ctx: BotCtx = { ...s.ctx, p: { ...s.ctx.p, intents: [intent] } };
      for (const c of commandsOf(bot.think(ctx))) {
        expect(isValidCommand(c)).toBe(true);
      }
    }
  });

  it('does not re-issue an ability command that is already in flight', () => {
    const [head] = samples;
    if (head === undefined) {
      return;
    }
    for (const s of samples) {
      const inFlight = abilityCommands(commandsOf(createBot(gunnerBrain, head.seat).think(s.ctx))).map((cmd) => ({
        cmd,
        at: s.ctx.tick + 5,
      }));
      const held = new Set(inFlight.map((f) => slotKey(f.cmd)));
      const out = createBot(gunnerBrain, head.seat).think({ ...s.ctx, inFlight });
      const reissued = abilityCommands(commandsOf(out)).filter((c) => held.has(slotKey(c)));
      expect(reissued).toEqual([]);
    }
  });
});
