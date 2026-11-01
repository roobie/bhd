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

  describe('pavise decision', () => {
    /** A ctx where the Pavise is ready, the line is live, a Penitent stands in it and a push closes in. */
    function staged(): { ctx: BotCtx; seat: Sample['seat'] } | undefined {
      const s = samples.find((x) => x.ctx.me.gunner !== undefined && x.ctx.p.enemies.length > 0);
      if (s?.ctx.me.gunner === undefined) {
        return undefined;
      }
      const ctx = structuredClone(s.ctx);
      const { me } = ctx;
      const g = me.gunner;
      if (g === undefined) {
        return undefined;
      }
      const [proto] = ctx.p.enemies;
      if (proto === undefined) {
        return undefined;
      }
      const enemies = [4, 5, 6, 9].map((d, i) => ({ ...proto, id: 900 + i, x: me.x + d, y: me.y + 0.1 * i }));
      const penitent = { ...me, id: 777, role: 'penitent' as const, kit: 'penitent' as const, x: me.x + 3, y: me.y };
      const abilities = me.abilities.map((a) => (a.slot === 2 ? { ...a, ready: true, cooldownLeft: 0 } : a));
      const out: BotCtx = {
        ...ctx,
        inFlight: [],
        me: { ...me, abilities, lineAllies: [777], gunner: { ...g, heat: 0.95, locked: false, pavise: undefined } },
        p: { ...ctx.p, enemies, heroes: [...ctx.p.heroes.filter((h) => h.id !== 777), penitent] },
      };
      return { ctx: out, seat: s.seat };
    }

    it('offers wait / shield / block with finite costs and legal, in-range casts', () => {
      const st = staged();
      expect(st).toBeDefined();
      if (st === undefined) {
        return;
      }
      const out = createBot(gunnerBrain, st.seat).think(st.ctx);
      const d = out.find((x) => x.id === 'gunner.pavise');
      expect(d?.options.map((o) => o.id)).toEqual(['wait', 'shield', 'block']);
      const range = st.ctx.me.gunner?.paviseRange ?? 0;
      const options = d?.options ?? [];
      expect(options.every((o) => Number.isFinite(o.value) && Number.isFinite(o.cost))).toBe(true);
      const cmds = options.flatMap((o) => o.commands);
      expect(cmds.every((c) => isValidCommand(c) && c.kind === 'ability' && c.slot === 2)).toBe(true);
      const reaches = cmds.flatMap((c) =>
        c.kind === 'ability' && c.x !== undefined && c.y !== undefined
          ? [Math.hypot(c.x - st.ctx.me.x, c.y - st.ctx.me.y)]
          : [],
      );
      expect(reaches.length).toBeGreaterThan(0);
      expect(reaches.every((r) => r <= range + 1e-9)).toBe(true);
      expect(d?.options.find((o) => o.id === 'shield')?.commands).toHaveLength(1);
    });

    it('does not decide while the ability is not ready or a cast is in flight', () => {
      const st = staged();
      if (st === undefined) {
        return;
      }
      const bot = createBot(gunnerBrain, st.seat);
      const abilities = st.ctx.me.abilities.map((a) => (a.slot === 2 ? { ...a, ready: false, cooldownLeft: 50 } : a));
      const cooling = bot.think({ ...st.ctx, me: { ...st.ctx.me, abilities } });
      expect(cooling.some((x) => x.id === 'gunner.pavise')).toBe(false);
      const cast = { kind: 'ability', hero: st.ctx.me.id, slot: 2 } as const;
      const busy = bot.think({ ...st.ctx, inFlight: [{ cmd: cast, at: st.ctx.tick + 3 }] });
      expect(busy.some((x) => x.id === 'gunner.pavise')).toBe(false);
    });
  });
});
