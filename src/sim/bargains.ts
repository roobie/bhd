// Bargains in the sim (wave 9, PLAN.md; contract in .work/wave/U-IUFI7QQSGH4543TP-w9-bargains/CONTRACT.md).
// With `GameConfig.bargains` unset nothing here runs and `Sim.bargains` is undefined.
//
// Flow. `bargainSystem` (right after `waveSystem`) runs four steps in order: (1) timed bargains whose
// last covered wave has ended are removed; (2) open offers past `expiresAt` lapse (a decline); (3) an
// offer opens when a wave listed in `afterWaves` has ended and a later wave remains; (4) with
// `pauseWaves`, the wave clock is frozen while any offer is open. A `bargain` command resolves an
// offer: the first valid one wins, later ones (and unknown offers or cards, or any command at or after
// `expiresAt`) are silent no-ops. A decline or a lapse heals the Ancient by `declineAncientHeal` of its max hp.
//
// The accepted list (`BargainState.taken`) is the whole truth and the only hashed part. Everything
// else is DERIVED from it and cached per state (`derivedOf`): the modifier layer (`ctx.mods`), the
// per-hero effective def (`heroDef`), the wave extras and master
// budget. The cache is keyed on the hashed `rev` counter, bumped whenever `taken` changes.
//
// Effect semantics (target is relative to the card's hero; a team card has hero 0 and then `self`,
// `team` and `allies` all mean every hero):
// - `dealt` / `taken` / `healTaken` / `respawn`: multipliers on matching heroes, composed in accept
//   order, gains before costs. `dealt` is damage a hero deals (any victim), `taken` damage a hero takes
//   after armour, `healTaken` heals a hero receives, `respawn` its respawn timer.
// - `def`: patches the effective HeroDef of matching heroes (validation guarantees
//   every hero the target reaches has the path; `applyDefPatches` still skips a missing one). `maxHp`, `armour` and `speed` are copied onto the entity at spawn, so
//   accepting or expiring rewrites them (`refreshHeroes`): a living hero keeps its missing hp, clamped
//   to 1..maxHp; a downed hero stays down and respawns at the new max.
// - Enemy def patches are rejected by validation for now (enemy defs are read straight from content).
// - `ancientHeal`: heals the Ancient by `value` x its max hp once, on accept (target ignored). On expiry
//   of a timed bargain nothing is undone: a heal is not revoked.
// - `waveExtra`: schedule mode only, `count` more `def` in every wave STARTED while the bargain
//   is live (appended after the scheduled groups, one every `EXTRA_GAP` seconds). Target ignored.
// - `masterBudget`: master mode only, `value` more budget granted at each wave start while live. Target ignored.
// - `durationWaves` d: a bargain from an offer opened after wave W covers waves W+1..W+d and is removed
//   (its derived effects vanish, base values return) once wave W+d has ended. Emits `bargain` op `expire`
//   WITH `card` (a window lapse has none) and no `end`. Absent = permanent (the shipped pool).
// - `pauseWaves`: while an offer is open `wavesPaused` is true and `bargainSystem` pushes `waves.nextAt`
//   back one tick per tick, so the countdown freezes. `canCallWave` is untouched: a `callWave` during
//   an open offer pulls `nextAt` to now and the wave starts the tick the last offer resolves.
//
// Kit audit (init* functions): `initGunner`, `initPenitent`, `initPsyker` and `initStandin` ignore
// the def and start every counter at 0, so no def-derived value is cached in kit state. Cooldowns
// already running (`cd*`, `attack.cooldown`, `calmTicks` ...) are remaining-tick counters and are NOT
// rescaled when a def patch lands; the new value applies from the next time they are set. Resource
// bands recompute from the effective def every tick.
//
// Invariant: the Ancient's hp goes down only through `leak` damage; `healAncient` (combat.ts) is the
// only way a bargain touches it. A field added to `BargainState` MUST be added to `hashBargains`
// (L-53OTZPIIVO2XYNNL).

import type { BargainDef, BargainsDef, Effect } from '../content/bargains.ts';
import { effectiveDef, effectReaches } from '../content/bargains.ts';
import type { GameConfig, HeroDef } from '../content/index.ts';
import { findById } from '../content/types.ts';
import type { Rng } from '../detmath/index.ts';
import { deriveRng, nextInt } from '../detmath/index.ts';
import { healAncient } from './combat.ts';
import type { BargainCommand } from './commands.ts';
import type { Mods, TickContext } from './context.ts';
import type { Entity } from './entities.ts';
import type { StateHasher } from './hash.ts';
import { perTick, ticks } from './time.ts';

/** One card of an open offer. */
interface OfferCard {
  /** `BargainDef.id`. */
  readonly bargain: string;
  /** Entity id of the hero the card benefits; 0 for a team card. */
  readonly hero: number;
}

/** An open offer: resolved by the first valid `bargain` command, or lapsing at `expiresAt` (a decline). */
interface Offer {
  readonly id: number;
  /** The wave whose end opened it. */
  readonly wave: number;
  /** First tick the offer is no longer open. */
  readonly expiresAt: number;
  readonly cards: readonly OfferCard[];
}

/** An accepted bargain. The list of these is the whole truth; the modifier layer is derived from it. */
interface TakenBargain {
  readonly bargain: string;
  readonly offer: number;
  /** Entity id of the benefiting hero, 0 for a team card. */
  readonly hero: number;
  /** Tick it was accepted. */
  readonly tick: number;
  /** The `wave` of the offer it came from; a timed bargain covers the `durationWaves` waves after it. */
  readonly wave: number;
}

export interface BargainState {
  /** Own stream `deriveRng(seed, 'bargains')`; the card draw uses it and nothing else does. */
  readonly rng: Rng;
  /** Id of the next offer to open (1-based). */
  nextOffer: number;
  /** How many entries of `bargains.afterWaves` have been handled (an offer opened, or none was possible). */
  opened: number;
  /** Open offers, ascending by id. */
  offers: Offer[];
  /** Accepted bargains in acceptance order. */
  taken: TakenBargain[];
  /** Bumped whenever `taken` changes (accept, expiry); the derived caches are keyed on it. */
  rev: number;
}

/** Seconds between the units of a `waveExtra` group. */
const EXTRA_GAP = 0.5;

export function createBargainState(seed: number): BargainState {
  return { rng: deriveRng(seed, 'bargains'), nextOffer: 1, opened: 0, offers: [], taken: [], rev: 0 };
}

/** Every field of the state, in fixed order. */
export function hashBargains(h: StateHasher, b: BargainState): void {
  for (const w of b.rng.state) {
    h.u32(w);
  }
  h.u32(b.nextOffer).u32(b.opened).u32(b.offers.length);
  for (const o of b.offers) {
    h.u32(o.id).u32(o.wave).f64(o.expiresAt).u32(o.cards.length);
    for (const c of o.cards) {
      h.str(c.bargain).u32(c.hero);
    }
  }
  h.u32(b.rev).u32(b.taken.length);
  for (const t of b.taken) {
    h.str(t.bargain).u32(t.offer).u32(t.hero).f64(t.tick).u32(t.wave);
  }
}

// ---------------------------------------------------------------- Derived layer

interface Item {
  readonly taken: TakenBargain;
  /** Gains, then costs. */
  readonly effects: readonly Effect[];
}

interface HeroMods {
  dealt: number;
  taken: number;
  heal: number;
  respawn: number;
}

interface Extra {
  readonly def: string;
  readonly count: number;
  readonly gap: number;
}

interface Derived {
  /** `BargainState.rev` this was built from; stale when it differs. */
  readonly rev: number;
  readonly items: readonly Item[];
  readonly mods: Map<number, HeroMods>;
  readonly heroDefs: Map<number, HeroDef | undefined>;
  readonly extras: readonly Extra[];
  readonly budget: number;
}

const DERIVED = new WeakMap<BargainState, Derived>();

/** The pool entry `id`, if the game has bargains and one by that id. */
export function bargainOf(game: GameConfig, id: string): BargainDef | undefined {
  return game.bargains === undefined ? undefined : findById(game.bargains.pool, id);
}

function buildExtras(items: readonly Item[]): Extra[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const e of item.effects) {
      if (e.kind === 'waveExtra') {
        counts.set(e.def, (counts.get(e.def) ?? 0) + e.count);
      }
    }
  }
  return [...counts].map(([def, count]) => ({ def, count, gap: EXTRA_GAP }));
}

function buildBudget(items: readonly Item[]): number {
  let sum = 0;
  for (const item of items) {
    for (const e of item.effects) {
      if (e.kind === 'masterBudget') {
        sum += e.value;
      }
    }
  }
  return sum;
}

function derivedOf(game: GameConfig, state: BargainState): Derived {
  const cached = DERIVED.get(state);
  if (cached !== undefined && cached.rev === state.rev) {
    return cached;
  }
  const items: Item[] = [];
  for (const taken of state.taken) {
    const def = bargainOf(game, taken.bargain);
    if (def !== undefined) {
      items.push({ taken, effects: [...def.gains, ...def.costs] });
    }
  }
  const built: Derived = {
    rev: state.rev,
    items,
    mods: new Map(),
    heroDefs: new Map(),
    extras: buildExtras(items),
    budget: buildBudget(items),
  };
  DERIVED.set(state, built);
  return built;
}

function heroModsOf(d: Derived, hero: number): HeroMods {
  const cached = d.mods.get(hero);
  if (cached !== undefined) {
    return cached;
  }
  const m: HeroMods = { dealt: 1, taken: 1, heal: 1, respawn: 1 };
  for (const item of d.items) {
    for (const e of item.effects) {
      if (!effectReaches(e.target, item.taken.hero, hero)) {
        continue;
      }
      switch (e.kind) {
        case 'dealt':
          m.dealt *= e.value;
          break;
        case 'taken':
          m.taken *= e.value;
          break;
        case 'healTaken':
          m.heal *= e.value;
          break;
        case 'respawn':
          m.respawn *= e.value;
          break;
        default:
          break;
      }
    }
  }
  d.mods.set(hero, m);
  return m;
}

/** The modifiers when nothing is taken: every multiplier is exactly 1, so results are bit-identical to no layer. */
const IDENTITY_MODS: Mods = {
  dealt: () => 1,
  taken: () => 1,
  heal: () => 1,
  respawn: () => 1,
};

/**
 * The modifier layer for `state`: reads the derived cache on every call, so it follows `state.taken`
 * (rebuilt when `rev` moves; the layer itself is never hashed). Only heroes are modified; enemies, props and the Ancient get 1.
 */
export function createMods(game: GameConfig, state: BargainState | undefined): Mods {
  if (state === undefined) {
    return IDENTITY_MODS;
  }
  const of = (e: Entity | undefined): HeroMods | undefined =>
    e?.kind === 'hero' && state.taken.length > 0 ? heroModsOf(derivedOf(game, state), e.id) : undefined;
  return {
    dealt: (src) => of(src)?.dealt ?? 1,
    taken: (victim) => of(victim)?.taken ?? 1,
    heal: (target) => of(target)?.heal ?? 1,
    respawn: (hero) => of(hero)?.respawn ?? 1,
  };
}

/** What `heroDef` reads: a `TickContext` or a `Sim` both fit. */
export type DefSource = Pick<TickContext, 'game' | 'bargains'>;

/** The effective def of `hero` (base def with the accepted `def` patches that reach it); undefined if it has none. */
export function heroDef(s: DefSource, hero: Readonly<Entity>): HeroDef | undefined {
  const base = findById(s.game.heroes, hero.def);
  const state = s.bargains;
  if (base === undefined || state === undefined || state.taken.length === 0) {
    return base;
  }
  const d = derivedOf(s.game, state);
  if (d.heroDefs.has(hero.id)) {
    return d.heroDefs.get(hero.id);
  }
  const out = effectiveDef(
    base,
    d.items.map((item) => ({ hero: item.taken.hero, effects: item.effects })),
    hero.id,
  );
  d.heroDefs.set(hero.id, out);
  return out;
}

/** True for an effect that changes what happens to or through a hero (not the Ancient or the waves). */
function heroFacing(e: Effect): boolean {
  switch (e.kind) {
    case 'dealt':
    case 'taken':
    case 'healTaken':
    case 'respawn':
      return true;
    case 'def':
      return true;
    default:
      return false;
  }
}

/** Ids of the accepted bargains with a hero-facing effect that reaches hero entity `hero`, acceptance order. */
export function bargainsReaching(s: DefSource, hero: number): string[] {
  const state = s.bargains;
  if (state === undefined || state.taken.length === 0) {
    return [];
  }
  return derivedOf(s.game, state)
    .items.filter((item) => item.effects.some((e) => heroFacing(e) && effectReaches(e.target, item.taken.hero, hero)))
    .map((item) => item.taken.bargain);
}

/** What the wave hooks read: a `TickContext` or a `Sim` both fit. */
export type WaveSource = Pick<TickContext, 'game' | 'bargains' | 'waves'>;

/** Extra spawn groups every wave started now gets (accepted `waveExtra` effects). Schedule mode only. */
export function bargainExtras(s: WaveSource): readonly Extra[] {
  const state = s.bargains;
  if (state === undefined || state.taken.length === 0 || s.game.master !== undefined) {
    return [];
  }
  return derivedOf(s.game, state).extras;
}

/** True while `pauseWaves` holds the wave clock because an offer is open. */
export function wavesPaused(ctx: TickContext): boolean {
  return ctx.game.bargains?.pauseWaves === true && (ctx.bargains?.offers.length ?? 0) > 0;
}

/** Extra wave-master budget (accepted `masterBudget` effects) granted when a wave starts. Master mode only. */
export function grantBudget(ctx: TickContext): number {
  const state = ctx.bargains;
  if (state === undefined || state.taken.length === 0 || ctx.game.master === undefined) {
    return 0;
  }
  return derivedOf(ctx.game, state).budget;
}

// ---------------------------------------------------------------- Heroes

/**
 * Rewrites the entity copies of `maxHp`, `armour` and `speed` from each hero's effective def. A
 * living hero keeps its missing hp (hp moves by the max hp change), clamped to 1..maxHp; a downed
 * hero stays at 0. Unpatched heroes come out unchanged (same expressions as `spawnHero`).
 */
export function refreshHeroes(ctx: TickContext): void {
  for (const e of ctx.entities.values()) {
    const def = e.kind === 'hero' ? heroDef(ctx, e) : undefined;
    if (def === undefined) {
      continue;
    }
    const maxHp = Math.max(1, def.maxHp);
    if (maxHp !== e.maxHp) {
      if (e.hp > 0) {
        e.hp = Math.min(maxHp, Math.max(1, e.hp + (maxHp - e.maxHp)));
      }
      e.maxHp = maxHp;
    }
    // A Spent Penitent keeps his armour penalty (penitent.ts sets it on Martyrdom's end and clears it with Spent).
    const spent = def.kit === 'penitent' && e.kit?.kind === 'penitent' && e.kit.spentTicks > 0;
    e.armour =
      def.kit === 'penitent' && spent ? Math.max(0, def.armour - def.martyrdom.spentArmourPenalty) : def.armour;
    e.speed = perTick(Math.max(0, def.speed));
  }
}

// ---------------------------------------------------------------- Offers

function compareIds(a: BargainDef, b: BargainDef): number {
  if (a.id < b.id) {
    return -1;
  }
  return a.id > b.id ? 1 : 0;
}

/** Entity id of the first hero whose kit is `kit`, 0 if none. */
function heroOfKit(ctx: TickContext, kit: string): number {
  for (const e of ctx.entities.values()) {
    if (e.kind === 'hero' && findById(ctx.game.heroes, e.def)?.kit === kit) {
      return e.id;
    }
  }
  return 0;
}

interface Candidate {
  readonly bargain: string;
  readonly hero: number;
}

/** Pool entries not taken or already on an open offer, with a hero for their kit, sorted by id. */
function candidatesFor(ctx: TickContext, state: BargainState, rules: BargainsDef): Candidate[] {
  const busy = new Set<string>(state.taken.map((t) => t.bargain));
  for (const o of state.offers) {
    for (const c of o.cards) {
      busy.add(c.bargain);
    }
  }
  const out: Candidate[] = [];
  for (const def of [...rules.pool].sort(compareIds)) {
    if (busy.has(def.id)) {
      continue;
    }
    const hero = def.scope === 'hero' && def.kit !== undefined ? heroOfKit(ctx, def.kit) : 0;
    if (def.scope === 'team' || hero !== 0) {
      out.push({ bargain: def.id, hero });
    }
  }
  return out;
}

/** Draws up to `rules.cards` distinct cards with a partial Fisher-Yates on the bargains stream. */
function drawCards(ctx: TickContext, state: BargainState, rules: BargainsDef): OfferCard[] {
  const pool = candidatesFor(ctx, state, rules);
  const n = Math.min(rules.cards, pool.length);
  const out: OfferCard[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + nextInt(state.rng, pool.length - i);
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) {
      break;
    }
    pool[i] = b;
    pool[j] = a;
    out.push(b);
  }
  return out;
}

function waveEnded(ctx: TickContext, n: number): boolean {
  return ctx.waves.n >= n && !ctx.waves.open.some((o) => o.n === n);
}

/** Opens the offers whose wave has ended. No offer opens after the last wave, or when nothing can be drawn. */
function openOffers(ctx: TickContext, state: BargainState, rules: BargainsDef): void {
  for (;;) {
    const after = rules.afterWaves[state.opened];
    if (after === undefined || !waveEnded(ctx, after)) {
      return;
    }
    state.opened += 1;
    if (after >= ctx.game.waves.waves.length) {
      continue;
    }
    const cards = drawCards(ctx, state, rules);
    if (cards.length === 0) {
      continue;
    }
    const offer: Offer = {
      id: state.nextOffer,
      wave: after,
      expiresAt: ctx.tick + ticks(rules.windowSeconds),
      cards,
    };
    state.nextOffer += 1;
    state.offers.push(offer);
    ctx.emit({
      tick: ctx.tick,
      kind: 'bargain',
      op: 'offer',
      offer: offer.id,
      wave: offer.wave,
      cards: cards.map((c) => c.bargain),
      until: offer.expiresAt,
    });
  }
}

/** The decline reward: the Ancient is healed by `declineAncientHeal` of its max hp (never hurt). */
function declineHeal(ctx: TickContext, rules: BargainsDef): void {
  const ancient = ctx.entities.get(ctx.ancientId);
  if (ancient !== undefined) {
    healAncient(ctx, rules.declineAncientHeal * ancient.maxHp);
  }
}

/** Removes timed bargains whose last covered wave has ended; emits `expire` with their card. */
function expireTimed(ctx: TickContext, state: BargainState): void {
  const gone = state.taken.filter((t) => {
    const waves = bargainOf(ctx.game, t.bargain)?.durationWaves;
    return waves !== undefined && waveEnded(ctx, t.wave + waves);
  });
  if (gone.length === 0) {
    return;
  }
  state.taken = state.taken.filter((t) => !gone.includes(t));
  state.rev += 1;
  for (const t of gone) {
    ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'expire', offer: t.offer, card: t.bargain, hero: t.hero });
  }
  refreshHeroes(ctx);
}

/** Runs right after `waveSystem`: expires timed bargains and lapsed offers, opens offers when a wave ends, holds the clock if paused. */
export function bargainSystem(ctx: TickContext): void {
  const state = ctx.bargains;
  const rules = ctx.game.bargains;
  if (state === undefined || rules === undefined) {
    return;
  }
  expireTimed(ctx, state);
  for (const offer of [...state.offers]) {
    if (ctx.tick >= offer.expiresAt) {
      state.offers = state.offers.filter((o) => o !== offer);
      ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'expire', offer: offer.id });
      declineHeal(ctx, rules);
      ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'end', offer: offer.id });
    }
  }
  openOffers(ctx, state, rules);
  if (wavesPaused(ctx) && ctx.waves.nextAt > ctx.tick) {
    ctx.waves.nextAt += 1;
  }
}

/** Accepts `card` of `offer`: records it, heals the Ancient for `ancientHeal` effects, rewrites hero stats. */
function accept(ctx: TickContext, state: BargainState, offer: Offer, card: OfferCard): void {
  state.offers = state.offers.filter((o) => o !== offer);
  state.taken = [
    ...state.taken,
    { bargain: card.bargain, offer: offer.id, hero: card.hero, tick: ctx.tick, wave: offer.wave },
  ];
  state.rev += 1;
  ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'accept', offer: offer.id, card: card.bargain, hero: card.hero });
  const def = bargainOf(ctx.game, card.bargain);
  const ancient = ctx.entities.get(ctx.ancientId);
  for (const e of [...(def?.gains ?? []), ...(def?.costs ?? [])]) {
    if (e.kind === 'ancientHeal' && ancient !== undefined) {
      healAncient(ctx, e.value * ancient.maxHp);
    }
  }
  refreshHeroes(ctx);
  ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'end', offer: offer.id });
}

/** Lineup slot of hero entity `id` (its def's index in `game.heroes`), -1 if it is no hero. */
function slotOfHero(ctx: TickContext, id: number): number {
  const e = ctx.entities.get(id);
  return e?.kind === 'hero' ? ctx.game.heroes.findIndex((h) => h.id === e.def) : -1;
}

/**
 * The `bargain` command. The first valid resolution of an offer wins; an unknown offer, an unknown
 * card, a second resolution or a command at or after the offer's `expiresAt` is a silent no-op (the
 * `cmd` event is still logged). Ownership: accepting a hero-bound card needs `player` to be that
 * hero's lineup slot (player = slot); team cards and Decline are open to any player. Whoever
 * resolves a bot hero's card therefore submits as that slot's player (the host or the shell does).
 */
export function applyBargainCommand(ctx: TickContext, cmd: BargainCommand, player: number): void {
  const state = ctx.bargains;
  const rules = ctx.game.bargains;
  const offer = state?.offers.find((o) => o.id === cmd.offer);
  if (state === undefined || rules === undefined || offer === undefined || ctx.tick >= offer.expiresAt) {
    return;
  }
  if (cmd.op === 'accept') {
    const card = offer.cards.find((c) => c.bargain === cmd.card);
    if (card !== undefined && (card.hero === 0 || player === slotOfHero(ctx, card.hero))) {
      accept(ctx, state, offer, card);
    }
    return;
  }
  state.offers = state.offers.filter((o) => o !== offer);
  ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'decline', offer: offer.id });
  declineHeal(ctx, rules);
  ctx.emit({ tick: ctx.tick, kind: 'bargain', op: 'end', offer: offer.id });
}
