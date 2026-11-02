// Gunner brain (wave w2-bots DESIGN §6.2: utility, expected value minus explicit cost, weighted by
// the doctrine). Owner: gunner-bot. Weights and thresholds are data in content/bots/gunner.ts.
//
// Decisions, in this order (commands of earlier ones apply first when they share a tick):
//   gunner.post      post | advance | hold       where to stand (leash around the post)
//   gunner.stance    free | brace                Brace is a toggle and roots; the option is the wanted state
//   gunner.fire      fire | hold                 `hold` command; allies in the overpen line are a cost (pillar 1)
//   gunner.vent      wait | vent                 against heat bands
//   gunner.pavise   wait | shield | block      Pavise: cover an ally in the line of fire, or wall off a push
//   gunner.furnace   wait | furnace              per doctrine.ultimate: free | spike | combo
//   gunner.reserve   none | furnace | vent       follow a 'pull' intent (the support's) with an armed cast
// A decision with nothing meaningful to weigh (ability not ready, braced and cannot move, ...) is
// left out of the list. The brain reads only `BotCtx`; its memory is the post and the brace aim.
// `lineAllies` is empty while she holds fire (no target), so the line is also estimated from
// positions; otherwise fire/hold would flap.

import { gunnerWeights } from '../content/bots/gunner.ts';
import type { Point } from '../content/types.ts';
import type { EnemyView, GunnerView, HeroView, IntentView, PaviseView } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import { ticks } from '../sim/time.ts';
import type { BotCtx, Brain, Decision, Option, SeatInfo } from './types.ts';
import { weight } from './utility.ts';

interface Memory {
  readonly post: Point;
  /** Where the next brace would aim (last think's focus while free). */
  lastAim: Point | undefined;
  /** The aim of the current brace; set when braced is first seen. */
  braceAim: Point | undefined;
  braced: boolean;
}

/** Everything a decision needs, derived once per think. */
interface Frame {
  readonly ctx: BotCtx;
  readonly mem: Memory;
  readonly me: HeroView;
  /** The kit's numbers as perception reports them (ranges, cones, heat bands). */
  readonly g: GunnerView;
  readonly heat: number;
  readonly spin: number;
  readonly braced: boolean;
  /** Not braced but rooted: the brace is coming off. */
  readonly unbracing: boolean;
  readonly locked: boolean;
  readonly furnace: boolean;
  readonly enemies: readonly EnemyView[];
  /** Enemies within firing range (braced range when braced). */
  readonly inRange: readonly EnemyView[];
  /** Where the gunner is looking: the biggest clump in view, else the nearest enemy. */
  readonly focus: Point | undefined;
  /** The aim abilities use: the brace aim when braced. */
  readonly aim: Point | undefined;
  readonly lineAllies: number;
  /** Her standing Pavise crosses the line of fire: allies behind it are safe, so are enemies. */
  readonly covered: boolean;
  /** Her standing Pavise lies between her and the nearest enemy: an overpenetrating line stops dead at it. */
  readonly clipped: boolean;
  readonly w: (key: string) => number;
}

const DEFAULTS = gunnerWeights();
const NEAR = 1;
const SLOT = { brace: 0, vent: 1, pavise: 2, furnace: 3 } as const;

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Enemies within `range` of `me` and inside the cone around `aim` (`cos` = cosine of the half angle). */
function inCone(
  me: Point,
  aim: Point | undefined,
  enemies: readonly EnemyView[],
  shape: { readonly range: number; readonly cos: number },
): EnemyView[] {
  if (aim === undefined) {
    return [];
  }
  const d = dist(me, aim);
  const ux = d < 1e-9 ? 1 : (aim.x - me.x) / d;
  const uy = d < 1e-9 ? 0 : (aim.y - me.y) / d;
  return enemies.filter((e) => {
    const vx = e.x - me.x;
    const vy = e.y - me.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    return len <= shape.range && (len < 1e-9 || ux * vx + uy * vy >= shape.cos * len);
  });
}

function pickFocus(ctx: BotCtx, view: number): Point | undefined {
  const { me } = ctx;
  let best: Point | undefined;
  let bestCount = 0;
  for (const c of ctx.p.clumps) {
    if (c.count > bestCount && dist(me, c) <= view) {
      best = { x: c.x, y: c.y };
      bestCount = c.count;
    }
  }
  if (best !== undefined) {
    return best;
  }
  let nearest: EnemyView | undefined;
  let nearestD = view;
  for (const e of ctx.p.enemies) {
    const d = dist(me, e);
    if (d <= nearestD) {
      nearest = e;
      nearestD = d;
    }
  }
  return nearest === undefined ? undefined : { x: nearest.x, y: nearest.y };
}

interface Dir {
  readonly ux: number;
  readonly uy: number;
  /** Distance to the nearest enemy, the one the kit shoots. */
  readonly len: number;
}

/** Unit vector from `me` to the nearest of `enemies` (the kit aims at the nearest hostile). */
function dirToNearest(me: Point, enemies: readonly EnemyView[]): Dir | undefined {
  let nearest: EnemyView | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const e of enemies) {
    const d = dist(me, e);
    if (d < best) {
      nearest = e;
      best = d;
    }
  }
  if (nearest === undefined) {
    return undefined;
  }
  const len = Math.max(1e-9, best);
  return { ux: (nearest.x - me.x) / len, uy: (nearest.y - me.y) / len, len };
}

/** Fraction t in [0, 1] where the segment from `a` to `b` crosses the barrier, undefined if it does not. */
function barrierCrossing(bar: PaviseView, a: Point, b: Point): number | undefined {
  const nx = -bar.uy;
  const ny = bar.ux;
  const da = (a.x - bar.x) * nx + (a.y - bar.y) * ny;
  const db = (b.x - bar.x) * nx + (b.y - bar.y) * ny;
  if (da * db >= 0) {
    return undefined;
  }
  const t = da / (da - db);
  const along = (a.x + (b.x - a.x) * t - bar.x) * bar.ux + (a.y + (b.y - a.y) * t - bar.y) * bar.uy;
  return Math.abs(along) <= bar.halfLength ? t : undefined;
}

/** Allies standing in the line to the nearest enemy, from positions (the kit aims at the nearest hostile). */
function estimateLine(ctx: BotCtx, g: GunnerView, allyRadius: number): number {
  const { me } = ctx;
  const range = g.attackRange;
  const dir = dirToNearest(
    me,
    ctx.p.enemies.filter((e) => dist(me, e) <= range),
  );
  if (dir === undefined) {
    return 0;
  }
  const { ux, uy } = dir;
  const reach = g.lineHalfWidth + allyRadius;
  let n = 0;
  for (const h of ctx.p.heroes) {
    if (h.id === me.id) {
      continue;
    }
    const along = (h.x - me.x) * ux + (h.y - me.y) * uy;
    const across = Math.abs((h.y - me.y) * ux - (h.x - me.x) * uy);
    if (along > 0 && along <= range && across <= reach) {
      n += 1;
    }
  }
  return n;
}

function frameOf(ctx: BotCtx, mem: Memory, g: GunnerView): Frame {
  const { me, p } = ctx;
  const w = (key: string): number => weight(ctx.weights, key, DEFAULTS[key] ?? 0);
  const { braced } = g;
  const focus = pickFocus(ctx, w('gunner.geo.view'));
  if (braced && !mem.braced) {
    mem.braceAim = mem.lastAim ?? focus;
  }
  if (!braced) {
    mem.braceAim = undefined;
    mem.lastAim = focus;
  }
  mem.braced = braced;
  const range = braced ? g.bracedRange : g.attackRange;
  const listed = me.lineAllies.length;
  const dir = dirToNearest(
    me,
    p.enemies.filter((e) => dist(me, e) <= range),
  );
  const crossing =
    g.pavise === undefined || dir === undefined
      ? undefined
      : barrierCrossing(g.pavise, me, { x: me.x + dir.ux * range, y: me.y + dir.uy * range });
  // A line that spares allies has none in it, listed or estimated.
  let lineAllies = listed;
  if (g.overpenAllies === 0) {
    lineAllies = 0;
  } else if (listed === 0 && me.target === 0) {
    lineAllies = estimateLine(ctx, g, w('gunner.geo.allyRadius'));
  }
  const covered = crossing !== undefined;
  const clipped = crossing !== undefined && dir !== undefined && crossing * range < dir.len;
  return {
    ctx,
    mem,
    me,
    g,
    heat: g.heat,
    spin: g.spin,
    braced,
    unbracing: !braced && me.statuses.some((s) => s.status === 'rooted'),
    locked: g.locked,
    furnace: g.furnaceActive,
    enemies: p.enemies,
    inRange: p.enemies.filter((e) => dist(me, e) <= range),
    focus,
    aim: braced ? (mem.braceAim ?? focus) : focus,
    lineAllies,
    covered,
    clipped,
    w,
  };
}

function abilityOf(me: HeroView, slot: number): HeroView['abilities'][number] | undefined {
  return me.abilities.find((a) => a.slot === slot);
}

function pending(f: Frame, match: (cmd: Command) => boolean): boolean {
  return f.ctx.inFlight.some((x) => match(x.cmd));
}

function castAt(f: Frame, slot: number, at: Point | undefined): Command {
  const hero = f.me.id;
  return at === undefined || f.braced
    ? { kind: 'ability', hero, slot }
    : { kind: 'ability', hero, slot, x: at.x, y: at.y };
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

// ---------------------------------------------------------------- gunner.post

/** Where advancing would put her: toward the focus, stopping at 80% of range, inside the leash. */
function advanceStand(f: Frame): Point {
  const { me } = f;
  const { post } = f.mem;
  const leash = Math.max(1, f.ctx.doctrine.leash);
  let stand: Point = { x: me.x, y: me.y };
  if (f.focus !== undefined) {
    const d = dist(me, f.focus);
    const walk = d - f.g.attackRange * 0.8;
    if (walk > 0) {
      stand = { x: me.x + ((f.focus.x - me.x) * walk) / d, y: me.y + ((f.focus.y - me.y) * walk) / d };
    }
  }
  const off = dist(post, stand);
  return off > leash
    ? { x: post.x + ((stand.x - post.x) * leash) / off, y: post.y + ((stand.y - post.y) * leash) / off }
    : stand;
}

function postDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  const { doctrine } = ctx;
  const { post } = f.mem;
  if (f.braced || f.unbracing) {
    return undefined;
  }
  const leash = Math.max(1, doctrine.leash);
  const engaged = f.inRange.length > 0 ? 1 : 0;
  const movingCost = w('gunner.post.spinCost') * f.spin * engaged;
  const stand = advanceStand(f);
  const canAdvance = f.focus !== undefined && dist(me, stand) >= NEAR;
  const lowHp = clamp01((0.5 - me.hpFrac) / 0.5);
  return {
    id: 'gunner.post',
    options: [
      {
        id: 'post',
        value: w('gunner.post.pull') * (dist(me, post) / leash) + w('gunner.post.retreat') * lowHp,
        cost: movingCost,
        commands: moveTo(f, post),
      },
      {
        id: 'advance',
        value: canAdvance ? w('gunner.post.advance') * doctrine.aggression * (1 - lowHp) : 0,
        cost:
          movingCost +
          w('gunner.post.threatCost') * me.threat +
          w('gunner.post.leashCost') * (1 - doctrine.risk) * (dist(post, stand) / leash),
        commands: canAdvance ? moveTo(f, stand) : [],
      },
      idle('hold', w('gunner.post.holdBase') + w('gunner.post.holdEngaged') * engaged),
    ],
  };
}

// ---------------------------------------------------------------- gunner.stance

function stanceDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  if (f.unbracing || pending(f, (c) => c.kind === 'ability' && c.slot === SLOT.brace)) {
    return undefined;
  }
  if (f.aim === undefined && !f.braced) {
    return undefined;
  }
  const { doctrine } = ctx;
  const arc = inCone(me, f.aim, f.enemies, { range: f.g.bracedRange, cos: f.g.arcCos });
  const flank = f.enemies.filter(
    (e) => dist(me, e) <= w('gunner.geo.flankRange') && !arc.some((a) => a.id === e.id),
  ).length;
  const arcN = Math.min(arc.length, w('gunner.stance.arcCap'));
  const lowHp = me.hpFrac < w('gunner.lowHp') ? 1 : 0;
  const braceValue = w('gunner.stance.arc') * arcN + (arcN > 0 ? w('gunner.stance.spin') : 0);
  const braceCost =
    w('gunner.stance.flank') * flank +
    w('gunner.stance.root') * me.threat +
    w('gunner.stance.lowHp') * lowHp +
    w('gunner.stance.aggro') * doctrine.aggression +
    (f.braced ? 0 : w('gunner.stance.setup'));
  const toggle: Command[] = f.braced
    ? [{ kind: 'ability', hero: me.id, slot: SLOT.brace }]
    : [castAt(f, SLOT.brace, f.aim)];
  return {
    id: 'gunner.stance',
    options: [
      {
        id: 'free',
        value: w('gunner.stance.freeBase') + w('gunner.stance.freeMobile') * doctrine.aggression,
        cost: f.braced ? w('gunner.stance.unbrace') * arcN : 0,
        commands: f.braced ? toggle : [],
      },
      { id: 'brace', value: braceValue, cost: braceCost, commands: f.braced ? [] : toggle },
    ],
  };
}

// ---------------------------------------------------------------- gunner.fire

function fireDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  if (f.locked || pending(f, (c) => c.kind === 'hold')) {
    return undefined;
  }
  const { risk } = ctx.doctrine;
  const n = f.inRange.length;
  const extra = Math.min(Math.max(0, n - 1), w('gunner.fire.clumpCap'));
  const value = n === 0 ? 0 : w('gunner.fire.value') * (1 + w('gunner.fire.clump') * extra);
  // Pillar 1: the line only hits allies once rounds overpenetrate (heat above the band, or Furnace Heart).
  const line = lineLive(f);
  const allyCost = f.covered ? 0 : w('gunner.redline.allyInLine') * f.lineAllies * line * (1 - risk);
  // Overpenetrating rounds stop dead at a barrier in front of the target: those shots are wasted and
  // clip her own line (the cause of the Pavise's self-blocks). Holding lets the heat fall back under it.
  const selfBlock = f.clipped ? w('gunner.pavise.selfBlock') * line : 0;
  const cool = f.furnace ? 0 : w('gunner.fire.overheatAvoid') * clamp01((f.heat - 0.9) / 0.1) * (1 - risk);
  return {
    id: 'gunner.fire',
    options: [
      {
        id: 'fire',
        value,
        cost: allyCost + selfBlock,
        commands: me.hold ? [{ kind: 'hold', hero: me.id, on: false }] : [],
      },
      {
        id: 'hold',
        value: cool,
        cost: 0,
        commands: me.hold ? [] : [{ kind: 'hold', hero: me.id, on: true }],
      },
    ],
  };
}

/**
 * A reservation of mine is live, in flight, or about to be made this think: the ability stays
 * unspent until it resolves (otherwise the vent decision spends what the reserve decision books).
 */
function holdsReservation(f: Frame): boolean {
  return (
    f.ctx.p.intents.some((i) => i.reservers.includes(f.me.id)) ||
    pending(f, (c) => c.kind === 'intent' && c.op === 'reserve') ||
    pullToReserve(f) !== undefined
  );
}

// ---------------------------------------------------------------- gunner.vent

function ventDecision(f: Frame): Decision | undefined {
  const { me, w } = f;
  const ab = abilityOf(me, SLOT.vent);
  if (ab === undefined || !ab.ready || f.locked || f.heat < w('gunner.vent.minHeat')) {
    return undefined;
  }
  if (pending(f, (c) => c.kind === 'ability' && c.slot === SLOT.vent)) {
    return undefined;
  }
  const hit = inCone(me, f.aim, f.enemies, { range: ab.range, cos: f.g.ventCos });
  const overpen = f.g.overpenAbove;
  const value =
    w('gunner.vent.damage') * f.heat * Math.min(hit.length, 6) +
    w('gunner.vent.urgency') * clamp01((f.heat - overpen) / (1 - overpen)) +
    (f.heat > overpen ? w('gunner.vent.allyRelief') * f.lineAllies : 0);
  const cost =
    w('gunner.vent.spinCost') * f.spin +
    (f.furnace ? w('gunner.vent.furnaceCost') : 0) +
    (holdsReservation(f) ? w('gunner.reserve.heldAbility') : 0);
  return {
    id: 'gunner.vent',
    options: [
      idle('wait', w('gunner.vent.waitBase')),
      { id: 'vent', value, cost, commands: [castAt(f, SLOT.vent, f.aim)] },
    ],
  };
}

// ---------------------------------------------------------------- gunner.pavise

/** How live her overpenetration line is: 1 once rounds overpenetrate, a ramp toward it before. */
function lineLive(f: Frame): number {
  if (f.furnace || f.heat > f.g.overpenAbove) {
    return 1;
  }
  const { pierceAbove, overpenAbove } = f.g;
  // No ramp when the pierce band is not below the overpenetration band (a patched pierceAbove).
  if (pierceAbove >= overpenAbove) {
    return 0;
  }
  return f.w('gunner.fire.anticipation') * clamp01((f.heat - pierceAbove) / (overpenAbove - pierceAbove));
}

/** Enemies the barrier at `at` would shadow: on her line, farther out than the barrier. */
function shadowed(f: Frame, dir: Dir, at: number): number {
  const { me, g } = f;
  const range = f.braced ? g.bracedRange : g.attackRange;
  let n = 0;
  for (const e of f.enemies) {
    const along = (e.x - me.x) * dir.ux + (e.y - me.y) * dir.uy;
    const across = Math.abs((e.y - me.y) * dir.ux - (e.x - me.x) * dir.uy);
    if (along > at && along <= range && across <= g.lineHalfWidth + f.w('gunner.geo.enemyRadius')) {
      n += 1;
    }
  }
  return n;
}

/** What the barrier costs: its cooldown, and the reach she loses past it (live line, or the chance it goes live). */
function paviseCost(f: Frame, dir: Dir, at: number): number {
  const floor = f.w('gunner.pavise.reachFloor');
  return (
    f.w('gunner.pavise.cooldown') + f.w('gunner.pavise.reachLoss') * shadowed(f, dir, at) * Math.max(lineLive(f), floor)
  );
}

function paviseCast(f: Frame, dir: Dir, at: number): Command {
  const d = Math.min(at, f.g.paviseRange);
  return { kind: 'ability', hero: f.me.id, slot: SLOT.pavise, x: f.me.x + dir.ux * d, y: f.me.y + dir.uy * d };
}

/** Shield: put the barrier just in front of the nearest ally standing in the line of fire. */
function shieldOption(f: Frame, dir: Dir): Option {
  const { me, g, w } = f;
  const range = f.braced ? g.bracedRange : g.attackRange;
  const reach = g.lineHalfWidth + w('gunner.geo.allyRadius');
  const live = lineLive(f) * (1 - f.ctx.doctrine.risk);
  let value = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const h of f.ctx.p.heroes) {
    const along = (h.x - me.x) * dir.ux + (h.y - me.y) * dir.uy;
    const across = Math.abs((h.y - me.y) * dir.ux - (h.x - me.x) * dir.uy);
    if (h.id === me.id || along <= 0 || along > range || across > reach) {
      continue;
    }
    value += w('gunner.pavise.shield') * (h.role === 'penitent' ? 1 + w('gunner.pavise.penitentBonus') : 1) * live;
    nearest = Math.min(nearest, along);
  }
  if (value === 0) {
    return { id: 'shield', value: 0, cost: 0, commands: [] };
  }
  const at = Math.max(w('gunner.pavise.minReach'), nearest - w('gunner.geo.allyRadius') - w('gunner.pavise.gap'));
  return { id: 'shield', value, cost: paviseCost(f, dir, at), commands: [paviseCast(f, dir, at)] };
}

/** Block: wall off a push, between her and the nearest enemy, when enough are close or she is hurt. */
function blockOption(f: Frame): Option {
  const { me, w } = f;
  const near = f.enemies.filter((e) => dist(me, e) <= w('gunner.pavise.pushRange'));
  const dir = dirToNearest(me, near);
  if (dir === undefined || near.length < w('gunner.pavise.minEnemies')) {
    return { id: 'block', value: 0, cost: 0, commands: [] };
  }
  const low = w('gunner.lowHp');
  const value =
    w('gunner.pavise.blockPush') * Math.min(near.length, w('gunner.pavise.blockCap')) +
    w('gunner.pavise.blockThreat') * me.threat +
    w('gunner.pavise.blockLowHp') * clamp01((low - me.hpFrac) / low);
  const at = Math.max(w('gunner.pavise.minReach'), dir.len - w('gunner.pavise.blockGap'));
  return { id: 'block', value, cost: paviseCost(f, dir, at), commands: [paviseCast(f, dir, at)] };
}

function paviseDecision(f: Frame): Decision | undefined {
  const { me, w } = f;
  const ab = abilityOf(me, SLOT.pavise);
  if (ab === undefined || !ab.ready || f.locked || pending(f, (c) => c.kind === 'ability' && c.slot === SLOT.pavise)) {
    return undefined;
  }
  const dir = dirToNearest(me, f.inRange);
  return {
    id: 'gunner.pavise',
    options: [
      idle('wait', w('gunner.pavise.waitBase')),
      dir === undefined ? { id: 'shield', value: 0, cost: 0, commands: [] } : shieldOption(f, dir),
      blockOption(f),
    ],
  };
}

// ---------------------------------------------------------------- gunner.furnace

/** Price of spending Furnace Heart under the doctrine's ultimate policy. */
function policyCost(f: Frame): number {
  switch (f.ctx.doctrine.ultimate) {
    case 'free':
      return f.w('gunner.furnace.costFree');
    case 'spike':
      return f.w('gunner.furnace.costSpike');
    default:
      return f.w('gunner.furnace.costCombo');
  }
}

function furnaceValue(f: Frame): number {
  const { me, ctx, w } = f;
  const { ultimate } = ctx.doctrine;
  const crowd = w('gunner.furnace.perEnemy') * Math.min(f.inRange.length, w('gunner.furnace.perEnemyCap'));
  if (ultimate === 'free') {
    return crowd;
  }
  const pierce = f.g.pierceAbove;
  const heat = w('gunner.furnace.heat') * clamp01((f.heat - pierce) / (1 - pierce));
  const distress = w('gunner.furnace.distress') * (ctx.p.team.lowHeroes + (ctx.p.ancient.hpFrac < 0.5 ? 1 : 0));
  if (ultimate === 'spike') {
    return crowd + heat + distress;
  }
  const reach = w('gunner.furnace.comboReach');
  const zone = ctx.p.comboWindows.find((c) => c.count >= 2 && dist(me, c) <= reach);
  const combo = zone === undefined ? 0 : (w('gunner.furnace.combo') * Math.min(zone.count, 4)) / 2;
  return crowd + heat + distress + combo;
}

function furnaceDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  const ab = abilityOf(me, SLOT.furnace);
  if (ab === undefined || !ab.ready || f.locked || f.furnace) {
    return undefined;
  }
  if (pending(f, (c) => c.kind === 'ability' && c.slot === SLOT.furnace)) {
    return undefined;
  }
  const cost =
    policyCost(f) +
    (ctx.doctrine.ultimate === 'free' ? 0 : w('gunner.furnace.ventLock') * (1 + 10 * me.threat)) +
    w('gunner.redline.allyInLine') * f.lineAllies * (1 - ctx.doctrine.risk) +
    (holdsReservation(f) ? w('gunner.reserve.heldAbility') : 0);
  return {
    id: 'gunner.furnace',
    options: [
      idle('wait', 0),
      { id: 'furnace', value: furnaceValue(f), cost, commands: [castAt(f, SLOT.furnace, undefined)] },
    ],
  };
}

// ---------------------------------------------------------------- gunner.reserve

function pullToReserve(f: Frame): IntentView | undefined {
  const margin = ticks(f.w('gunner.reserve.marginSeconds'));
  return f.ctx.p.intents.find(
    (i) =>
      i.intentKind === 'pull' &&
      !i.fired &&
      i.by !== f.me.id &&
      // The reservation applies after the seat's reaction delay, and must land before the intent fires.
      i.fireTick > f.ctx.tick + f.ctx.delay + margin &&
      !i.reservers.includes(f.me.id) &&
      !pending(f, (c) => c.kind === 'intent' && c.op === 'reserve' && c.intent === i.id),
  );
}

function reserveDecision(f: Frame): Decision | undefined {
  const { me, ctx, w } = f;
  const intent = pullToReserve(f);
  if (intent === undefined || f.locked || f.furnace) {
    return undefined;
  }
  const at = { x: intent.x, y: intent.y };
  const reach = w('gunner.reserve.reach');
  if (dist(me, at) > reach) {
    return undefined;
  }
  const offset = Math.max(1, ticks(w('gunner.reserve.offsetSeconds')));
  const left = intent.fireTick + offset - ctx.tick;
  const near = clamp01(f.enemies.filter((e) => dist(e, at) <= reach).length / 4);
  const reserve = (slot: number): Command => ({
    kind: 'intent',
    op: 'reserve',
    hero: me.id,
    intent: intent.id,
    slot,
    offset,
  });
  const furnaceAb = abilityOf(me, SLOT.furnace);
  const ventAb = abilityOf(me, SLOT.vent);
  const furnaceOk = furnaceAb !== undefined && furnaceAb.cooldownLeft <= left;
  const ventOk =
    ventAb !== undefined &&
    ventAb.cooldownLeft <= left &&
    f.heat >= w('gunner.vent.minHeat') &&
    // Heat keeps rising while she waits; a reserved vent fails if she locks first.
    f.heat < w('gunner.reserve.ventMaxHeat');
  return {
    id: 'gunner.reserve',
    options: [
      idle('none', 0),
      {
        id: 'furnace',
        value: furnaceOk ? w('gunner.reserve.furnace') * near : 0,
        cost: furnaceOk ? policyCost(f) : w('gunner.reserve.heldAbility'),
        commands: [reserve(SLOT.furnace)],
      },
      {
        id: 'vent',
        value: ventOk ? w('gunner.reserve.vent') * f.heat * near : 0,
        cost: ventOk ? w('gunner.vent.spinCost') * f.spin : w('gunner.reserve.heldAbility'),
        commands: [reserve(SLOT.vent)],
      },
    ],
  };
}

// ---------------------------------------------------------------- brain

export const gunnerBrain: Brain<Memory> = {
  init: (seat: SeatInfo) => ({ post: seat.post, lastAim: undefined, braceAim: undefined, braced: false }),
  think: (ctx, mem) => {
    if (ctx.me.gunner === undefined) {
      return [];
    }
    const f = frameOf(ctx, mem, ctx.me.gunner);
    const all = [
      postDecision(f),
      stanceDecision(f),
      fireDecision(f),
      ventDecision(f),
      paviseDecision(f),
      furnaceDecision(f),
      reserveDecision(f),
    ];
    return all.filter((d): d is Decision => d !== undefined);
  },
};
