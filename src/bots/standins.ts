// Stand-in brains (tank, ranged, support). Owner: standin-bots. One utility brain for all three
// placeholder roles, dispatching on `ctx.me.role`. Decision ids are `standin.<role>.<decision>`:
//   tank     stand (post / front of the lane threat / sidesteps), taunt
//   ranged   stand (post / forward), mark (which enemy, and whether now)
//   support  stand (post / by the hurt), heal, pull
// Scoring is DESIGN §6.2: value - explicit cost, doctrine-weighted (aggression pushes forward and
// toward casting, risk discounts the cost of danger and of standing in the Gunner's line). Every
// position is clamped to the doctrine's leash around the post. The support does not cast a good
// pull directly: it posts a `pull` intent at the clump so the Gunner can reserve against it.
// Weights are data (content/bots/standins.ts). Reads only `BotCtx`; nothing here is sim state.

import { standinWeights } from '../content/bots/standins.ts';
import type { Point } from '../content/types.ts';
import type { AbilityView, Clump, EnemyView, HeroView } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import { ticks } from '../sim/time.ts';
import type { BotCtx, Brain, Decision, Option, SeatInfo } from './types.ts';
import { weight } from './utility.ts';

interface StandinMemory {
  readonly post: Point;
}

const DEFAULTS = standinWeights();
/** Within this of a spot counts as being there (also the re-issue threshold for moves). */
const NEAR = 1;
const MARK_CANDIDATES = 3;
const TAUNT_CAP = 6;
const PULL_REACH_MARGIN = 1;
/** Fraction of the hurt-ally pull that 'ally' needs before it beats the post. */
const HURT_FRAC = 0.8;

function w(ctx: BotCtx, key: string): number {
  return weight(ctx.weights, key, DEFAULTS[key] ?? 0);
}

function rw(ctx: BotCtx, term: string): number {
  return w(ctx, `standin.${ctx.me.role}.${term}`);
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Moves `pt` toward `post` until it is within `leash` of it. */
function leashed(post: Point, pt: Point, leash: number): Point {
  const d = dist(post, pt);
  if (d <= leash || d === 0) {
    return pt;
  }
  const k = leash / d;
  return { x: post.x + (pt.x - post.x) * k, y: post.y + (pt.y - post.y) * k };
}

/** The point `by` away from `from`, along the way to `to` (`from` itself when they coincide). */
function toward(from: Point, to: Point, by: number): Point {
  const d = dist(from, to);
  if (d === 0) {
    return from;
  }
  return { x: from.x + ((to.x - from.x) / d) * by, y: from.y + ((to.y - from.y) / d) * by };
}

function distToSegment(pt: Point, a: Point, b: Point): number {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const len2 = sx * sx + sy * sy;
  const t = len2 === 0 ? 0 : clamp01(((pt.x - a.x) * sx + (pt.y - a.y) * sy) / len2);
  return dist(pt, { x: a.x + sx * t, y: a.y + sy * t });
}

function ability(me: HeroView, effect: string): AbilityView | undefined {
  return me.abilities.find((a) => a.effect === effect);
}

function hasPendingCast(ctx: BotCtx, slot: number): boolean {
  return ctx.inFlight.some((f) => f.cmd.kind === 'ability' && f.cmd.hero === ctx.me.id && f.cmd.slot === slot);
}

function hasPendingPost(ctx: BotCtx): boolean {
  return ctx.inFlight.some((f) => f.cmd.kind === 'intent' && f.cmd.op === 'post' && f.cmd.hero === ctx.me.id);
}

function hasLiveIntent(ctx: BotCtx): boolean {
  return ctx.p.intents.some((i) => i.by === ctx.me.id);
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

/** The enemy furthest along the lane (ties to the lowest id): the threat in front of the Ancient. */
function frontEnemy(enemies: readonly EnemyView[]): EnemyView | undefined {
  let best: EnemyView | undefined;
  for (const e of enemies) {
    if (best === undefined || e.progress > best.progress) {
      best = e;
    }
  }
  return best;
}

interface Line {
  readonly from: Point;
  readonly to: Point;
}

/** The Gunner's overpenetration line, derived from her position and target (undefined when she has none). */
function gunnerLine(ctx: BotCtx): Line | undefined {
  const gunner = ctx.p.heroes.find((h) => h.role === 'gunner' && h.id !== ctx.me.id);
  const target = gunner === undefined ? undefined : ctx.p.enemies.find((e) => e.id === gunner.target);
  if (gunner === undefined || target === undefined) {
    return undefined;
  }
  return { from: gunner, to: toward(gunner, target, w(ctx, 'standin.line.range')) };
}

/** Explicit cost of standing at `pt`: the role's line weight, discounted by the doctrine's risk. */
function lineCost(ctx: BotCtx, line: Line | undefined, pt: Point): number {
  if (line === undefined || distToSegment(pt, line.from, line.to) > w(ctx, 'standin.line.halfWidth')) {
    return 0;
  }
  return rw(ctx, 'stand.inGunnerLine') * (1 - 0.6 * ctx.doctrine.risk);
}

interface Spot {
  readonly id: string;
  readonly pt: Point;
  readonly value: number;
}

/** Scores candidate spots: value, minus travel, danger (when it differs from here) and the line. */
function standDecision(ctx: BotCtx, spots: readonly Spot[]): Decision {
  const { me, doctrine } = ctx;
  const line = gunnerLine(ctx);
  const travel = rw(ctx, 'stand.travel');
  const danger = w(ctx, `standin.${me.role}.stand.danger`);
  const options: Option[] = spots.map((s) => {
    const away = dist(me, s.pt) / Math.max(1, doctrine.leash);
    const forward = s.id === 'post' ? 0 : danger * me.threat * (1 - doctrine.risk);
    return {
      id: s.id,
      value: s.value,
      cost: travel * away + forward + lineCost(ctx, line, s.pt),
      commands: moveTo(ctx, s.pt),
    };
  });
  return { id: `standin.${me.role}.stand`, options };
}

function postSpot(ctx: BotCtx, post: Point): Spot {
  return { id: 'post', pt: post, value: rw(ctx, 'stand.post') * (1 - 0.5 * ctx.doctrine.aggression) };
}

function tankStand(ctx: BotCtx, post: Point): Decision {
  const spots: Spot[] = [postSpot(ctx, post)];
  const front = frontEnemy(ctx.p.enemies);
  if (front !== undefined) {
    // In front of the threat: between it and the Ancient, a gap short of it.
    const hold = toward(front, ctx.p.ancient, w(ctx, 'standin.tank.stand.gap'));
    const lead = leashed(post, hold, ctx.doctrine.leash);
    const value = w(ctx, 'standin.tank.stand.front') * (0.4 + ctx.doctrine.aggression);
    const d = toward({ x: 0, y: 0 }, { x: lead.y - post.y, y: post.x - lead.x }, 1);
    const side = w(ctx, 'standin.tank.stand.sidestep');
    spots.push({ id: 'front', pt: lead, value });
    for (const [id, sign] of [
      ['front.left', 1],
      ['front.right', -1],
    ] as const) {
      const pt = leashed(post, { x: lead.x + d.x * side * sign, y: lead.y + d.y * side * sign }, ctx.doctrine.leash);
      spots.push({ id, pt, value: value * 0.95 });
    }
  }
  return standDecision(ctx, spots);
}

function rangedStand(ctx: BotCtx, post: Point): Decision {
  const spots: Spot[] = [postSpot(ctx, post)];
  const mark = ability(ctx.me, 'mark');
  const near = nearestEnemy(post, ctx.p.enemies);
  if (near !== undefined) {
    // Close to firing range of the nearest enemy, on the near side of it.
    const reach = (mark?.range ?? 10) * w(ctx, 'standin.ranged.stand.reach');
    const pt = leashed(post, toward(near, post, Math.min(reach, dist(near, post))), ctx.doctrine.leash);
    spots.push({ id: 'forward', pt, value: rw(ctx, 'stand.forward') * (0.2 + ctx.doctrine.aggression) });
  }
  return standDecision(ctx, spots);
}

function supportStand(ctx: BotCtx, post: Point): Decision {
  const spots: Spot[] = [postSpot(ctx, post)];
  const hurt = ctx.p.heroes.filter((h) => h.id !== ctx.me.id && h.hpFrac < HURT_FRAC);
  if (hurt.length > 0) {
    const cx = hurt.reduce((s, h) => s + h.x, 0) / hurt.length;
    const cy = hurt.reduce((s, h) => s + h.y, 0) / hurt.length;
    const lowest = hurt.reduce((m, h) => Math.min(m, h.hpFrac), 1);
    const pt = leashed(post, { x: cx, y: cy }, ctx.doctrine.leash);
    spots.push({ id: 'ally', pt, value: rw(ctx, 'stand.ally') * (1 - lowest) * 2 });
  }
  return standDecision(ctx, spots);
}

function castOption(ctx: BotCtx, id: string, args: { value: number; cost: number; cmd: Command }): Option {
  const slot = args.cmd.kind === 'ability' ? args.cmd.slot : -1;
  const pending = slot >= 0 && hasPendingCast(ctx, slot);
  return { id, value: args.value, cost: args.cost, commands: pending ? [] : [args.cmd] };
}

function wait(value: number): Option {
  return { id: 'wait', value, cost: 0, commands: [] };
}

function tankTaunt(ctx: BotCtx): Decision[] {
  const { me, p, doctrine } = ctx;
  const ab = ability(me, 'taunt');
  if (ab === undefined || !ab.ready) {
    return [];
  }
  const loose = p.enemies.filter(
    (e) => dist(me, e) <= ab.radius && !e.statuses.some((s) => s.status === 'taunted' && s.src === me.id),
  );
  if (loose.length === 0) {
    return [];
  }
  // Relief: threat the other heroes are taking, which the taunt turns onto the tank.
  const relief = p.heroes.reduce((s, h) => (h.id === me.id ? s : s + h.threat), 0);
  const value =
    (w(ctx, 'standin.tank.taunt.perEnemy') * Math.min(TAUNT_CAP, loose.length) +
      w(ctx, 'standin.tank.taunt.relief') * relief) *
    (0.6 + 0.8 * doctrine.aggression);
  return [
    {
      id: 'standin.tank.taunt',
      options: [
        wait(0),
        castOption(ctx, 'taunt', {
          value,
          cost: w(ctx, 'standin.tank.taunt.cost'),
          cmd: { kind: 'ability', hero: me.id, slot: ab.slot },
        }),
      ],
    },
  ];
}

function clumpOf(clumps: readonly Clump[], id: number): Clump | undefined {
  return clumps.find((c) => c.members.includes(id));
}

function markValue(ctx: BotCtx, e: EnemyView): number {
  const hp = w(ctx, 'standin.ranged.mark.hp') * clamp01(e.hp / w(ctx, 'standin.ranged.mark.hpScale'));
  const front =
    w(ctx, 'standin.ranged.mark.front') * clamp01(1 - dist(e, ctx.p.ancient) / w(ctx, 'standin.ranged.mark.far'));
  const clump = clumpOf(ctx.p.clumps, e.id);
  const mates = clump === undefined ? 0 : clamp01((clump.count - 1) / 5);
  return (hp + front + w(ctx, 'standin.ranged.mark.clump') * mates) * (0.6 + 0.8 * ctx.doctrine.aggression);
}

function rangedMark(ctx: BotCtx): Decision[] {
  const { me, p } = ctx;
  const ab = ability(me, 'mark');
  if (ab === undefined || !ab.ready) {
    return [];
  }
  const cands = p.enemies
    .filter((e) => dist(me, e) <= ab.range && !e.statuses.some((s) => s.status === 'marked'))
    .map((e) => ({ e, value: markValue(ctx, e) }))
    .sort((a, b) => b.value - a.value || a.e.id - b.e.id)
    .slice(0, MARK_CANDIDATES);
  if (cands.length === 0) {
    return [];
  }
  const cost = w(ctx, 'standin.ranged.mark.cost');
  return [
    {
      id: 'standin.ranged.mark',
      options: [
        wait(w(ctx, 'standin.ranged.mark.wait')),
        ...cands.map(({ e, value }) =>
          castOption(ctx, `mark.${e.id}`, {
            value,
            cost,
            cmd: { kind: 'ability', hero: me.id, slot: ab.slot, target: e.id },
          }),
        ),
      ],
    },
  ];
}

function supportHeal(ctx: BotCtx): Decision[] {
  const { me, p } = ctx;
  const ab = ability(me, 'heal');
  if (ab === undefined || !ab.ready) {
    return [];
  }
  const hurt = p.heroes.filter((h) => h.hpFrac < 1 && dist(me, h) <= ab.radius);
  if (hurt.length === 0) {
    return [];
  }
  const missing = hurt.reduce((s, h) => s + (1 - h.hpFrac), 0);
  const urgent = hurt.filter((h) => h.hpFrac <= w(ctx, 'standin.support.heal.urgentFrac')).length;
  const value = w(ctx, 'standin.support.heal.perMissing') * missing + w(ctx, 'standin.support.heal.urgent') * urgent;
  return [
    {
      id: 'standin.support.heal',
      options: [
        wait(0),
        castOption(ctx, 'heal', {
          value,
          cost: w(ctx, 'standin.support.heal.cost'),
          cmd: { kind: 'ability', hero: me.id, slot: ab.slot },
        }),
      ],
    },
  ];
}

/** The biggest clump whose centroid the pull can reach (ties to the lower clump id). */
function pullClump(ctx: BotCtx, ab: AbilityView): Clump | undefined {
  let best: Clump | undefined;
  for (const c of ctx.p.clumps) {
    if (dist(ctx.me, c) <= ab.range - PULL_REACH_MARGIN && (best === undefined || c.count > best.count)) {
      best = c;
    }
  }
  return best;
}

function supportPull(ctx: BotCtx): Decision[] {
  const { me, doctrine } = ctx;
  const ab = ability(me, 'pull');
  if (ab === undefined || !ab.ready) {
    return [];
  }
  const clump = pullClump(ctx, ab);
  if (clump === undefined || clump.count < 2) {
    return [];
  }
  const eager = 0.6 + 0.8 * doctrine.aggression;
  const base = w(ctx, 'standin.support.pull.perEnemy') * clump.count * eager;
  const cost = w(ctx, 'standin.support.pull.cost');
  const options: Option[] = [wait(0)];
  if (clump.count >= w(ctx, 'standin.support.pull.minClump')) {
    // A good clump: announce it, so the Gunner can line up on the pulled enemies. At most one
    // intent per hero; none while an earlier one is live or on its way.
    const busy = hasLiveIntent(ctx) || hasPendingPost(ctx);
    const post: Command = {
      kind: 'intent',
      op: 'post',
      hero: me.id,
      slot: ab.slot,
      intentKind: 'pull',
      x: clump.x,
      y: clump.y,
      fireIn: Math.max(1, ticks(w(ctx, 'standin.support.pull.fireInSeconds'))),
    };
    options.push({
      id: 'intent',
      value: base + w(ctx, 'standin.support.pull.coordination'),
      cost,
      commands: busy ? [] : [post],
    });
  } else {
    options.push(
      castOption(ctx, 'cast', {
        value: base * w(ctx, 'standin.support.pull.directFactor'),
        cost,
        cmd: { kind: 'ability', hero: me.id, slot: ab.slot, x: clump.x, y: clump.y },
      }),
    );
  }
  return [{ id: 'standin.support.pull', options }];
}

function roleDecisions(ctx: BotCtx, post: Point): Decision[] {
  switch (ctx.me.role) {
    case 'tank':
      return [tankStand(ctx, post), ...tankTaunt(ctx)];
    case 'ranged':
      return [rangedStand(ctx, post), ...rangedMark(ctx)];
    case 'support':
      return [supportStand(ctx, post), ...supportHeal(ctx), ...supportPull(ctx)];
    case 'gunner':
      return [];
    default: {
      const unknown: never = ctx.me.role;
      throw new Error(`unhandled role ${String(unknown)}`);
    }
  }
}

export const standinBrain: Brain<StandinMemory> = {
  init: (seat: SeatInfo) => ({ post: seat.post }),
  think: (ctx, memory) => roleDecisions(ctx, memory.post),
};
