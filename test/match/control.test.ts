// Match seats under control commands (wave 10 slice D): a handover or policy change lands at the same
// tick on every Match fed the same commands, local calls that differ do not leak into the game, and
// the bot bargain decider only ever resolves what is a bot's (D-VXJDVX4RFRWSLUQB). Engine specs only:
// nothing here pins which card a bot prefers.

import { describe, expect, it } from 'vitest';
import { type BargainScope, bargainDecisions } from '../../src/bots/bargain.ts';
import type { BotCtx } from '../../src/bots/types.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultGame } from '../../src/content/index.ts';
import { Match } from '../../src/match/match.ts';
import type { CardView, OfferView } from '../../src/perception/types.ts';
import { type Command, SYSTEM_PLAYER } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { testBargains } from '../bargains-fixture.ts';

const HERO_PREFIX = 'hero-'.length;
const SEED = 0x5e_a7_10_c3;

function match(over: { driven?: number[]; bargainPolicy?: 'bots' | 'human' | 'off' } = {}): Match {
  return new Match({
    seed: SEED,
    game: { ...defaultGame(), bargains: testBargains() },
    bots: defaultBotSetup(),
    hashEvery: 10,
    ...over,
  });
}

function control(m: Match, tick: number, cmd: Command): void {
  if (!m.sim.command(SYSTEM_PLAYER, cmd, tick).ok) {
    throw new Error(`control command rejected: ${JSON.stringify(cmd)}`);
  }
}

function stepTo(m: Match, tick: number, log: SimEvent[] = []): SimEvent[] {
  while (m.tick < tick && !m.ended) {
    log.push(...m.step());
  }
  return log;
}

/** The same control stream on a Match: a handover, a policy flip and a handover back. */
function feed(m: Match): void {
  control(m, 40, { kind: 'control', op: 'drive', slot: 0, by: 'human' });
  control(m, 120, { kind: 'control', op: 'bargainPolicy', policy: 'human' });
  control(m, 400, { kind: 'control', op: 'drive', slot: 0, by: 'bot' });
  control(m, 450, { kind: 'control', op: 'bargainPolicy', policy: 'bots' });
}

describe('control commands drive Match state deterministically', () => {
  it('a handover and a policy change land at the same tick on two Matches', () => {
    const ms = [match(), match()];
    ms.forEach(feed);
    const seen = ms.map((m) => {
      const trace: string[] = [];
      for (let t = 1; t <= 500; t++) {
        stepTo(m, t);
        trace.push(`${m.driven.join(',')}|${m.bargainPolicy}|${m.seats.map((s) => s.slot).join(',')}`);
      }
      return trace;
    });
    expect(seen[0]).toEqual(seen[1]);
    // The change is visible right after the tick the command applied in, not before.
    expect(seen[0]?.[38]).not.toBe(seen[0]?.[39]);
    expect(seen[0]?.[38]).toBe(seen[0]?.[0]);
    expect(ms[0]?.sim.hash()).toBe(ms[1]?.sim.hash());
  });

  it('differing local calls with identical control commands end in identical hashes', () => {
    const a = match();
    const b = match();
    feed(a);
    feed(b);
    // b wobbles its local state through the API; the control stream still wins at its ticks.
    stepTo(a, 30);
    stepTo(b, 30);
    b.setBargainPolicy('off');
    stepTo(a, 100);
    stepTo(b, 100);
    expect(a.driven).toEqual([0]);
    expect(b.driven).toEqual([0]);
    stepTo(a, 130);
    stepTo(b, 130);
    expect(b.bargainPolicy).toBe('human');
    expect(a.bargainPolicy).toBe('human');
    stepTo(a, 1500);
    stepTo(b, 1500);
    expect(a.driven).toEqual(b.driven);
    expect(a.bargainPolicy).toBe(b.bargainPolicy);
    expect(a.sim.hash()).toBe(b.sim.hash());
  });

  it('a replay of the command log reproduces the handover and the whole game', () => {
    const live = match();
    feed(live);
    const log = stepTo(live, 1500);
    // A bare Sim: the log already carries what the bots and the handover syncs issued.
    const replay = new Sim({ seed: SEED, game: { ...defaultGame(), bargains: testBargains() }, hashEvery: 10 });
    // Re-submitted at the tick it applied in, as the sim's own log carries it.
    const refused = log.flatMap((e) => (e.kind === 'cmd' && !replay.command(e.player, e.cmd, e.tick).ok ? [e] : []));
    expect(refused).toEqual([]);
    while (replay.tick < live.tick) {
      replay.step();
    }
    expect(replay.hash()).toBe(live.sim.hash());
  });
});

describe('bot bargain ownership', () => {
  it('no bot ever submits for a human-driven slot', () => {
    for (const policy of ['bots', 'human'] as const) {
      const m = match({ driven: [0, 2], bargainPolicy: policy });
      const log = stepTo(m, 2400);
      const bad = log.filter((e) => e.kind === 'cmd' && e.player !== SYSTEM_PLAYER && [0, 2].includes(e.player));
      expect(bad).toEqual([]);
    }
  });

  it('a seat that is handed to a human stops submitting from the next tick on', () => {
    const m = match();
    control(m, 200, { kind: 'control', op: 'drive', slot: 1, by: 'human' });
    const log = stepTo(m, 1200);
    // Commands the bot queued before the handover may still land (at most its reaction delay).
    const late = log.filter((e) => e.kind === 'cmd' && e.player === 1 && e.tick > 200 + 40 && e.tick < 1200);
    expect(late.filter((e) => e.kind === 'cmd' && e.cmd.kind !== 'autocast' && e.cmd.kind !== 'hold')).toEqual([]);
  });

  // A Perception with an offer holding a card for each hero and one team card.
  function ctxWithOffer(m: Match): { ctx: BotCtx; offer: OfferView; heroes: number[] } {
    const p0 = m.perception;
    const heroes = p0.heroes.map((h) => h.id);
    const cards: CardView[] = [
      ...heroes.map((id, i) => ({
        bargain: `hero-${i}`,
        scope: 'hero' as const,
        hero: id,
        gains: [
          {
            kind: 'dealt' as const,
            target: 'self' as const,
            value: 1.5,
            path: '',
            op: '' as const,
            def: '',
            base: undefined,
          },
        ],
        costs: [],
      })),
      {
        bargain: 'team-0',
        scope: 'team',
        hero: 0,
        gains: [{ kind: 'dealt', target: 'team', value: 1.5, path: '', op: '' as const, def: '', base: undefined }],
        costs: [],
      },
    ];
    const offer: OfferView = { id: 3, wave: 1, expiresAt: 900, ticksLeft: 400, cards };
    const p = { ...p0, bargains: { open: [offer], taken: [], declineAncientHeal: 0.04 } };
    const setup = defaultBotSetup();
    const [doctrine] = setup.doctrines;
    const [me] = p.heroes;
    if (doctrine === undefined || me === undefined) {
      throw new Error('fixture');
    }
    return { ctx: { p, me, doctrine, weights: setup.kitWeights, delay: 8, tick: p.tick, inFlight: [] }, offer, heroes };
  }

  it('the decider offers only cards bound to bot-driven heroes, as that hero slot', () => {
    const { ctx, heroes } = ctxWithOffer(match());
    const botHeroes = heroes.slice(1);
    const scope: BargainScope = { bots: new Map(botHeroes.map((id, i) => [id, i + 1])), team: false };
    for (const policy of ['evaluate', 'acceptAll', 'declineAll'] as const) {
      const [d] = bargainDecisions(ctx, policy, scope);
      expect(d).toBeDefined();
      const options = d?.options ?? [];
      const accepts = options.flatMap((o) => {
        const [cmd] = o.commands;
        return cmd?.kind === 'bargain' && cmd.op === 'accept' ? [{ card: cmd.card, player: o.player }] : [];
      });
      expect(accepts.length).toBeGreaterThan(0);
      // Only bot heroes' cards (hero-1..), each as that hero's slot; never hero-0 or the team card.
      expect(accepts.map((a) => a.card).sort()).toEqual(['hero-1', 'hero-2', 'hero-3']);
      expect(accepts.map((a) => [a.card, a.player])).toEqual(
        accepts.map((a) => [a.card, Number(a.card.slice(HERO_PREFIX))]),
      );
      // Without the right to Decline the option remains but does nothing.
      expect(options.find((o) => o.id === 'decline')?.commands).toEqual([]);
    }
  });

  it('team cards and Decline are options only when the scope hands them over', () => {
    const { ctx, heroes } = ctxWithOffer(match());
    const bots = new Map(heroes.map((id, i) => [id, i]));
    const ids = (team: boolean): string[] =>
      (bargainDecisions(ctx, 'evaluate', { bots, team })[0]?.options ?? []).map((o) => o.id);
    expect(ids(true)).toContain('accept:team-0');
    expect(ids(false)).not.toContain('accept:team-0');
    const declines = (team: boolean): Command[] =>
      bargainDecisions(ctx, 'evaluate', { bots, team })[0]
        ?.options.find((o) => o.id === 'decline')
        ?.commands.slice() ?? [];
    expect(declines(true)).toHaveLength(1);
    expect(declines(false)).toEqual([]);
  });

  it('with nothing of the offer a bot may take, there is no decision', () => {
    const { ctx } = ctxWithOffer(match());
    expect(bargainDecisions(ctx, 'evaluate', { bots: new Map(), team: false })).toEqual([]);
  });

  it('in a played game a bot accept of a hero card is submitted as that hero slot', () => {
    const m = match({ bargainPolicy: 'bots' });
    const log = stepTo(m, 2400);
    const accepts = log.filter((e) => e.kind === 'cmd' && e.cmd.kind === 'bargain' && e.cmd.op === 'accept');
    const taken = log.filter((e) => e.kind === 'bargain' && e.op === 'accept');
    expect(accepts.length, 'the bots took at least one card').toBeGreaterThan(0);
    expect(taken.length).toBe(accepts.length);
    const { heroes, fallen } = m.perception;
    const slotOf = (id: number): number | undefined => [...heroes, ...fallen].find((h) => h.id === id)?.slot;
    for (const t of taken) {
      if (t.kind !== 'bargain' || t.hero === undefined || t.hero === 0) {
        continue;
      }
      // The accept that took a hero's card was submitted as that hero's slot.
      const cmd = accepts.find(
        (e) => e.kind === 'cmd' && e.tick === t.tick && e.cmd.kind === 'bargain' && e.cmd.offer === t.offer,
      );
      expect(cmd?.kind === 'cmd' ? cmd.player : -1).toBe(slotOf(t.hero));
    }
  });
});
