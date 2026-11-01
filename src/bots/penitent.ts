// Penitent brain (utility, expected value minus explicit cost, weighted by the doctrine). Owner: slice A (w8).
// Weights and thresholds are data in content/bots/penitent.ts. Decision ids are `penitent.<decision>`:
//   penitent.post       post | engage | pull | hold   where to stand; `pull` = hold the spot of a reserved Martyrdom
//   penitent.chain      wait | chain                  Chain of Penance when enemies are on him or allies are threatened
//   penitent.martyrdom  wait | martyrdom             on its own, when the crowd / Pain / distress make it clearly valuable
//   penitent.reserve    none | martyrdom              follow a 'pull' intent (the Psyker's) with an armed Martyrdom
// The reserve decision books Martyrdom `offsetSeconds` (about +0.3 s) after the pull fires and, in the same
// think, orders the walk to the pull point; the post decision then keeps him there until the reservation
// resolves. A pull intent's lead must exceed this seat's reaction delay (L-KQN4NFNYHTDB6VAL), so intents
// that fire too soon after the delay plus a margin are not taken. Reads only `BotCtx`.

import { penitentWeights } from '../content/bots/penitent.ts';
import type { Point } from '../content/types.ts';
import type { AbilityView, EnemyView, HeroView, IntentView } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import { ticks } from '../sim/time.ts';
import type { BotCtx, Brain, Decision, Option, SeatInfo } from './types.ts';
import { weight } from './utility.ts';

interface Memory {
  readonly post: Point;
}

interface Frame {
  readonly ctx: BotCtx;
  readonly mem: Memory;
  readonly me: HeroView;
  readonly enemies: readonly EnemyView[];
  readonly spent: boolean;
  readonly martyrdomActive: boolean;
  readonly pain: number;
  readonly w: (key: string) => number;
}

const DEFAULTS = penitentWeights();
const NEAR = 1;
const SLOT = { chain: 0, martyrdom: 3 } as const;

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function abilityOf(me: HeroView, slot: number): AbilityView | undefined {
  return me.abilities.find((a) => a.slot === slot);
}

function resourceFrac(me: HeroView, name: string): number {
  return me.resources.find((r) => r.name === name)?.frac ?? 0;
}

function pending(f: Frame, match: (cmd: Command) => boolean): boolean {
  return f.ctx.inFlight.some((x) => match(x.cmd));
}

function frameOf(ctx: BotCtx, mem: Memory): Frame {
  const { me } = ctx;
  return {
    ctx,
    mem,
    me,
    enemies: ctx.p.enemies,
    spent: resourceFrac(me, 'spent') > 0,
    martyrdomActive: resourceFrac(me, 'martyrdom') > 0,
    pain: resourceFrac(me, 'pain'),
    w: (key) => weight(ctx.weights, key, DEFAULTS[key] ?? 0),
  };
}

/** A move command unless already there, already heading there, or one is on its way. */
function moveTo(f: Frame, to: Point): Command[] {
  const { me, ctx } = f;
  if (dist(me, to) < NEAR || (me.dest !== undefined && dist(me.dest, to) < NEAR)) {
    return [];
  }
  const going = ctx.inFlight.some((x) => x.cmd.kind === 'move' && dist({ x: x.cmd.x, y: x.cmd.y }, to) < NEAR);
  return going ? [] : [{ kind: 'move', hero: me.id, x: to.x, y: to.y }];
}

function idle(id: string, value: number): Option {
  return { id, value, cost: 0, commands: [] };
}

function cast(f: Frame, slot: number): Command {
  return { kind: 'ability', hero: f.me.id, slot };
}

function enemiesNear(f: Frame, at: Point, radius: number): EnemyView[] {
  return f.enemies.filter((e) => dist(e, at) <= radius);
}

/** Allies (not me) under pressure: high incoming damage or low hp. */
function threatenedAllies(f: Frame): HeroView[] {
  const { w } = f;
  return f.ctx.p.heroes.filter(
    (h) => h.id !== f.me.id && (h.threat >= w('penitent.chain.allyThreat') || h.hpFrac < w('penitent.lowHp')),
  );
}

// ---------------------------------------------------------------- reservations

/** The intent my Martyrdom reservation is on (live, or on its way), if any. */
function reservedIntent(f: Frame): IntentView | undefined {
  const { ctx, me } = f;
  return ctx.p.intents.find(
    (i) =>
      i.reservers.includes(me.id) || pending(f, (c) => c.kind === 'intent' && c.op === 'reserve' && c.intent === i.id),
  );
}

/** A pull intent I could still reserve against: far enough in the future, not mine, not yet reserved. */
function pullToReserve(f: Frame): IntentView | undefined {
  const margin = ticks(f.w('penitent.reserve.marginSeconds'));
  return f.ctx.p.intents.find(
    (i) =>
      i.intentKind === 'pull' &&
      !i.fired &&
      i.by !== f.me.id &&
      i.fireTick > f.ctx.tick + f.ctx.delay + margin &&
      !i.reservers.includes(f.me.id) &&
      !pending(f, (c) => c.kind === 'intent' && c.op === 'reserve' && c.intent === i.id),
  );
}

/** A reservation is live, in flight or about to be made: Martyrdom stays unspent. */
function holdsReservation(f: Frame): boolean {
  return reservedIntent(f) !== undefined || pullToReserve(f) !== undefined;
}

function policyCost(f: Frame, prefix: string): number {
  switch (f.ctx.doctrine.ultimate) {
    case 'free':
      return f.w(`${prefix}.costFree`);
    case 'spike':
      return f.w(`${prefix}.costSpike`);
    default:
      return f.w(`${prefix}.costCombo`);
  }
}

function reserveDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  const intent = pullToReserve(f);
  const ab = abilityOf(me, SLOT.martyrdom);
  if (intent === undefined || ab === undefined || f.spent || f.martyrdomActive) {
    return undefined;
  }
  const at = { x: intent.x, y: intent.y };
  const offset = Math.max(1, ticks(w('penitent.reserve.offsetSeconds')));
  const left = intent.fireTick + offset - ctx.tick;
  const leadSeconds = Math.max(0, (intent.fireTick - ctx.tick - ctx.delay) / ticks(1));
  const reach = w('penitent.reserve.reach');
  // He must be inside the taunt radius when it goes off: what he can walk in the lead plus the reach.
  if (dist(me, at) > w('penitent.geo.speed') * leadSeconds + reach) {
    return undefined;
  }
  const ok = ab.cooldownLeft <= left;
  const near = clamp01(enemiesNear(f, at, reach).length / 4);
  return {
    id: 'penitent.reserve',
    options: [
      idle('none', 0),
      {
        id: 'martyrdom',
        value: ok ? w('penitent.reserve.martyrdom') * near : 0,
        cost: ok ? policyCost(f, 'penitent.reserve') : w('penitent.reserve.heldAbility'),
        commands: [
          { kind: 'intent', op: 'reserve', hero: me.id, intent: intent.id, slot: SLOT.martyrdom, offset },
          ...moveTo(f, at),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------- penitent.post

/** Where to fight: next to the enemy nearest a threatened ally, else the nearest enemy in view. */
function engageFocus(f: Frame): EnemyView | undefined {
  const { me, w } = f;
  const view = w('penitent.geo.view');
  const candidates = f.enemies.filter((e) => dist(me, e) <= view);
  let best: EnemyView | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  const allies = threatenedAllies(f);
  for (const e of candidates) {
    const anchors: Point[] = allies.length > 0 ? allies : [me];
    const d = Math.min(...anchors.map((a) => dist(a, e)));
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function engageStand(f: Frame, focus: EnemyView): Point {
  const { me } = f;
  const { post } = f.mem;
  const leash = Math.max(1, f.ctx.doctrine.leash);
  const d = dist(me, focus);
  const short = Math.min(d, f.w('penitent.geo.stopShort'));
  const stand =
    d < 1e-9
      ? { x: me.x, y: me.y }
      : { x: focus.x - ((focus.x - me.x) * short) / d, y: focus.y - ((focus.y - me.y) * short) / d };
  const off = dist(post, stand);
  return off > leash
    ? { x: post.x + ((stand.x - post.x) * leash) / off, y: post.y + ((stand.y - post.y) * leash) / off }
    : stand;
}

function postDecision(f: Frame): Decision {
  const { me, ctx, w } = f;
  const { doctrine } = ctx;
  const { post } = f.mem;
  const leash = Math.max(1, doctrine.leash);
  const reserved = reservedIntent(f);
  const focus = engageFocus(f);
  const stand = focus === undefined ? undefined : engageStand(f, focus);
  const canEngage = stand !== undefined && dist(me, stand) >= NEAR;
  const lowHp = clamp01((0.5 - me.hpFrac) / 0.5);
  const engaged = enemiesNear(f, me, 3).length > 0 ? 1 : 0;
  return {
    id: 'penitent.post',
    options: [
      {
        id: 'post',
        value: w('penitent.post.pull') * (dist(me, post) / leash) + w('penitent.post.retreat') * lowHp,
        cost: 0,
        commands: moveTo(f, post),
      },
      {
        id: 'engage',
        value: canEngage ? w('penitent.post.engage') * (0.5 + doctrine.aggression) * (1 - lowHp) : 0,
        cost:
          w('penitent.post.threatCost') * me.threat +
          w('penitent.post.leashCost') * (1 - doctrine.risk) * (dist(post, stand ?? post) / leash),
        commands: canEngage && stand !== undefined ? moveTo(f, stand) : [],
      },
      {
        id: 'pull',
        value: reserved === undefined ? 0 : w('penitent.post.reserved'),
        cost: 0,
        commands: reserved === undefined ? [] : moveTo(f, { x: reserved.x, y: reserved.y }),
      },
      idle('hold', w('penitent.post.holdBase') + w('penitent.post.holdEngaged') * engaged),
    ],
  };
}

// ---------------------------------------------------------------- penitent.chain

function chainDecision(f: Frame): Decision | undefined {
  const { me, w } = f;
  const ab = abilityOf(me, SLOT.chain);
  if (ab === undefined || !ab.ready || f.spent) {
    return undefined;
  }
  if (pending(f, (c) => c.kind === 'ability' && c.slot === SLOT.chain)) {
    return undefined;
  }
  const inReach = enemiesNear(f, me, ab.radius).length;
  if (inReach === 0) {
    return undefined;
  }
  const covered = threatenedAllies(f).filter((h) => dist(me, h) <= ab.radius + 4).length;
  const value =
    w('penitent.chain.perEnemy') * Math.min(inReach, w('penitent.chain.perEnemyCap')) +
    w('penitent.chain.ally') * covered;
  return {
    id: 'penitent.chain',
    options: [
      idle('wait', w('penitent.chain.waitBase')),
      { id: 'chain', value, cost: w('penitent.chain.cost'), commands: [cast(f, SLOT.chain)] },
    ],
  };
}

// ---------------------------------------------------------------- penitent.martyrdom

function martyrdomDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  const ab = abilityOf(me, SLOT.martyrdom);
  if (ab === undefined || !ab.ready || f.spent || f.martyrdomActive || holdsReservation(f)) {
    return undefined;
  }
  if (pending(f, (c) => c.kind === 'ability' && c.slot === SLOT.martyrdom)) {
    return undefined;
  }
  const crowd = enemiesNear(f, me, ab.radius).length;
  if (crowd === 0) {
    return undefined;
  }
  const { team } = ctx.p;
  const distress = w('penitent.martyrdom.distress') * (team.lowHeroes + (ctx.p.ancient.hpFrac < 0.5 ? 1 : 0));
  const hurt = w('penitent.martyrdom.lowHp') * clamp01((0.6 - me.hpFrac) / 0.6);
  const value =
    w('penitent.martyrdom.perEnemy') * Math.min(crowd, w('penitent.martyrdom.perEnemyCap')) +
    w('penitent.martyrdom.pain') * f.pain +
    distress +
    hurt;
  return {
    id: 'penitent.martyrdom',
    options: [
      idle('wait', 0),
      { id: 'martyrdom', value, cost: policyCost(f, 'penitent.martyrdom'), commands: [cast(f, SLOT.martyrdom)] },
    ],
  };
}

// ---------------------------------------------------------------- brain

export const penitentBrain: Brain<Memory> = {
  init: (seat: SeatInfo) => ({ post: seat.post }),
  think: (ctx, mem) => {
    const f = frameOf(ctx, mem);
    const all = [postDecision(f), chainDecision(f), martyrdomDecision(f), reserveDecision(f)];
    return all.filter((d): d is Decision => d !== undefined);
  },
};
