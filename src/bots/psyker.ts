// Psyker brain (D-4TKP7DQRMLBK6K7W: Warp Gambler). Owner: slice B (w8). Weights are data
// (content/bots/psyker.ts); decision ids are `psyker.<decision>`:
//   psyker.stand   post | forward      where to stand (leashed around the post)
//   psyker.fire    fire | hold         `hold` command; basic attacks feed Warp, so a high backlash
//                                      chance with allies inside Discharge reach is a cost
//   psyker.lash    wait | intent | cast  a clump worth a pull: post a `pull` intent (fires after
//                                      `fireInSeconds`, later than the Gunner's reaction delay), or
//                                      cast at once at a smaller one; allies in Discharge reach
//                                      times the backlash chance are the cost
// A decision with nothing to weigh is left out. Reads only `BotCtx` (the backlash chance comes from
// the `backlash` resource); nothing here is sim state.

import { psykerWeights } from '../content/bots/psyker.ts';
import type { Point } from '../content/types.ts';
import type { AbilityView, Clump, EnemyView, HeroView } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import { ticks } from '../sim/time.ts';
import type { BotCtx, Brain, Decision, Option, SeatInfo } from './types.ts';
import { weight } from './utility.ts';

interface Memory {
  readonly post: Point;
}

const DEFAULTS = psykerWeights();
/** Within this of a spot counts as being there (also the re-issue threshold for moves). */
const NEAR = 1;
/** A clump this much inside the cast range is castable. */
const REACH_MARGIN = 0.5;

function w(ctx: BotCtx, key: string): number {
  return weight(ctx.weights, key, DEFAULTS[key] ?? 0);
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function resource(me: HeroView, name: string): number {
  return me.resources.find((r) => r.name === name)?.frac ?? 0;
}

/** Other heroes inside Discharge reach: the ones a backlash would hit. */
function alliesInReach(ctx: BotCtx): number {
  const reach = w(ctx, 'psyker.geo.dischargeRadius') + w(ctx, 'psyker.geo.dischargeMargin');
  return ctx.p.heroes.filter((h) => h.id !== ctx.me.id && dist(h, ctx.me) <= reach).length;
}

/** Expected friendly-fire cost of a backlash roll: allies in reach, times the chance, discounted by risk. */
function backlashCost(ctx: BotCtx, key: string): number {
  return w(ctx, key) * alliesInReach(ctx) * resource(ctx.me, 'backlash') * (1 - 0.6 * ctx.doctrine.risk);
}

function leashed(post: Point, pt: Point, leash: number): Point {
  const d = dist(post, pt);
  if (d <= leash || d === 0) {
    return pt;
  }
  const k = leash / d;
  return { x: post.x + (pt.x - post.x) * k, y: post.y + (pt.y - post.y) * k };
}

function toward(from: Point, to: Point, by: number): Point {
  const d = dist(from, to);
  if (d === 0) {
    return from;
  }
  return { x: from.x + ((to.x - from.x) / d) * by, y: from.y + ((to.y - from.y) / d) * by };
}

function nearestEnemy(from: Point, enemies: readonly EnemyView[]): EnemyView | undefined {
  let best: EnemyView | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const e of enemies) {
    const d = dist(from, e);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** A move to `pt`, unless the hero is there, already walking there, or has such a move in flight. */
function moveTo(ctx: BotCtx, pt: Point): Command[] {
  const { me, inFlight } = ctx;
  if (dist(me, pt) < NEAR || (me.dest !== undefined && dist(me.dest, pt) < NEAR)) {
    return [];
  }
  for (let i = inFlight.length - 1; i >= 0; i--) {
    const c = inFlight[i]?.cmd;
    if (c?.kind === 'move' && c.hero === me.id) {
      return dist(c, pt) < NEAR ? [] : [{ kind: 'move', hero: me.id, x: pt.x, y: pt.y }];
    }
  }
  return [{ kind: 'move', hero: me.id, x: pt.x, y: pt.y }];
}

function stand(ctx: BotCtx, post: Point, lash: AbilityView | undefined): Decision {
  const { me, doctrine } = ctx;
  const spots: { id: string; pt: Point; value: number }[] = [
    { id: 'post', pt: post, value: w(ctx, 'psyker.stand.post') * (1 - 0.5 * doctrine.aggression) },
  ];
  const near = nearestEnemy(post, ctx.p.enemies);
  if (near !== undefined) {
    const reach = (lash?.range ?? 10) * w(ctx, 'psyker.geo.standOff');
    const pt = leashed(post, toward(near, post, Math.min(reach, dist(near, post))), doctrine.leash);
    spots.push({ id: 'forward', pt, value: w(ctx, 'psyker.stand.forward') * (0.2 + doctrine.aggression) });
  }
  const options: Option[] = spots.map((s) => ({
    id: s.id,
    value: s.value,
    cost:
      (w(ctx, 'psyker.stand.travel') * dist(me, s.pt)) / Math.max(1, doctrine.leash) +
      (s.id === 'post' ? 0 : w(ctx, 'psyker.stand.danger') * me.threat * (1 - doctrine.risk)),
    commands: moveTo(ctx, s.pt),
  }));
  return { id: 'psyker.stand', options };
}

/** The hold state the seat will have once its in-flight commands land. */
function holdingSoon(ctx: BotCtx): boolean {
  let { hold } = ctx.me;
  for (const f of ctx.inFlight) {
    if (f.cmd.kind === 'hold' && f.cmd.hero === ctx.me.id) {
      hold = f.cmd.on;
    }
  }
  return hold;
}

function fireDecision(ctx: BotCtx): Decision {
  const { me } = ctx;
  const holding = holdingSoon(ctx);
  const hold: Command = { kind: 'hold', hero: me.id, on: true };
  const free: Command = { kind: 'hold', hero: me.id, on: false };
  return {
    id: 'psyker.fire',
    options: [
      {
        id: 'fire',
        value: w(ctx, 'psyker.fire.value'),
        cost: backlashCost(ctx, 'psyker.fire.allyCost'),
        commands: holding ? [free] : [],
      },
      { id: 'hold', value: w(ctx, 'psyker.fire.holdBase'), cost: 0, commands: holding ? [] : [hold] },
    ],
  };
}

/** The biggest clump within cast range. */
function bestClump(ctx: BotCtx, range: number): Clump | undefined {
  let best: Clump | undefined;
  for (const c of ctx.p.clumps) {
    if (dist(ctx.me, c) <= range - REACH_MARGIN && (best === undefined || c.count > best.count)) {
      best = c;
    }
  }
  return best;
}

function hasPendingCast(ctx: BotCtx, slot: number): boolean {
  return ctx.inFlight.some((f) => f.cmd.kind === 'ability' && f.cmd.hero === ctx.me.id && f.cmd.slot === slot);
}

function hasPendingPost(ctx: BotCtx): boolean {
  return ctx.inFlight.some((f) => f.cmd.kind === 'intent' && f.cmd.op === 'post' && f.cmd.hero === ctx.me.id);
}

/** My own pull intent is posted (or on its way) and has not fired yet. */
function ownPullPending(ctx: BotCtx): boolean {
  return ctx.p.intents.some((i) => i.by === ctx.me.id && i.intentKind === 'pull' && !i.fired) || hasPendingPost(ctx);
}

function lashDecision(ctx: BotCtx): Decision[] {
  const { me, doctrine } = ctx;
  const ab = me.abilities.find((a) => a.effect === 'lash');
  if (ab === undefined || !ab.ready) {
    return [];
  }
  const clump = bestClump(ctx, ab.range);
  if (clump === undefined || clump.count < w(ctx, 'psyker.lash.minDirect')) {
    return [];
  }
  const eager = 0.6 + 0.8 * doctrine.aggression;
  const base = w(ctx, 'psyker.lash.perEnemy') * Math.min(w(ctx, 'psyker.lash.perEnemyCap'), clump.count) * eager;
  const cost = w(ctx, 'psyker.lash.cost') + backlashCost(ctx, 'psyker.lash.allyCost');
  const options: Option[] = [{ id: 'wait', value: w(ctx, 'psyker.lash.waitBase'), cost: 0, commands: [] }];
  if (clump.count >= w(ctx, 'psyker.lash.minClump')) {
    // A good clump: announce it so the Gunner can line up on the pulled enemies. At most one
    // intent per hero; none while an earlier one is live or on its way.
    const busy = ctx.p.intents.some((i) => i.by === me.id) || hasPendingPost(ctx);
    const post: Command = {
      kind: 'intent',
      op: 'post',
      hero: me.id,
      slot: ab.slot,
      intentKind: 'pull',
      x: clump.x,
      y: clump.y,
      fireIn: Math.max(1, ticks(w(ctx, 'psyker.lash.fireInSeconds'))),
    };
    options.push({
      id: 'intent',
      value: base + w(ctx, 'psyker.lash.coordination'),
      cost,
      commands: busy ? [] : [post],
    });
  } else if (!ownPullPending(ctx)) {
    // Casting now while an announced pull is still to fire would waste the cooldown it relies on.
    const cast: Command = { kind: 'ability', hero: me.id, slot: ab.slot, x: clump.x, y: clump.y };
    options.push({
      id: 'cast',
      value: base * w(ctx, 'psyker.lash.directFactor'),
      cost,
      commands: hasPendingCast(ctx, ab.slot) ? [] : [cast],
    });
  }
  return [{ id: 'psyker.lash', options }];
}

export const psykerBrain: Brain<Memory> = {
  init: (seat: SeatInfo) => ({ post: seat.post }),
  think: (ctx, memory) => [
    stand(
      ctx,
      memory.post,
      ctx.me.abilities.find((a) => a.effect === 'lash'),
    ),
    fireDecision(ctx),
    ...lashDecision(ctx),
  ],
};
