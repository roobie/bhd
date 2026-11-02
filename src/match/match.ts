// Match: the Sim plus the players that are not humans (wave w2-bots DESIGN "Bots run outside the
// sim step"). Pure: seed + config + sim history determine everything, bot state is not hashed.
// Owner: contracts.
//
// step():
//  1. sim.step() runs tick T;
//  2. T's events are folded into PerceptionMemory (every tick);
//  3. on think ticks (T % thinkEvery == 0) perception is computed once (memoised by tick as
//     `perception`) and every seat thinks, from state no newer than T;
//  4. each seat's picked commands go to `sim.command(player, cmd, T + d)` with
//     d = max(1, ticks(reactionSeconds)); a seat skips a command identical to its most recent
//     not-yet-applied command on the same channel (see `channelOf`); the rest is in `inFlight`;
//  5. the result is the sim's events followed by `choice` events (tick T).
// Seats: players 0-3 = lineup slots 0-3, player 4 = the Director (needs `game.master`).
// Driven slots (a human plays them; `options.driven` and `setDriven`): their seats exist but do not
// think. Driven-ness is Match state outside the sim; what it changes in the sim goes through
// ordinary commands (player = slot, applied next tick): a bot-driven hero has every autocast bit on
// and a human-driven one every bit off (a hold is cleared on each handover), and a bot's `ability`
// command is dropped while that ability's autocast bit is off (the hero's mask is honoured).
// A replay of the command log therefore reproduces any handover without knowing about Match.
// RNG streams: deriveRng(seed, 'bot:<slot>') and deriveRng(seed, 'director'); the sim's is never read.
// A `choice` is emitted for a decision with >= 2 options when it is first evaluated and whenever its
// pick changes; a decision absent from a think is forgotten (its next appearance is "first").
// Brains receive the cached Perception and MasterView deep-frozen (always on: the objects are
// small plain data built once per think tick, so freezing them costs next to nothing).

import { type BargainScope, bargainDecisions } from '../bots/bargain.ts';
import { defaultBrains } from '../bots/brains.ts';
import type { Bot, BotCtx, BrainTable, Decision, InFlight, SeatInfo } from '../bots/types.ts';
import { decide } from '../bots/utility.ts';
import type { BargainBotPolicy, BotSetup, Doctrine } from '../content/bots.ts';
import type { DirectorDef } from '../content/director.ts';
import type { GameConfig } from '../content/index.ts';
import type { PerceptionDef } from '../content/perception.ts';
import { defaultPerception } from '../content/perception.ts';
import type { Point } from '../content/types.ts';
import type { Rng } from '../detmath/index.ts';
import { deriveRng } from '../detmath/index.ts';
import type { Director, DirectorStatus } from '../director/director.ts';
import { createDirector } from '../director/director.ts';
import type { PerceptionMemory } from '../perception/memory.ts';
import { createMemory, foldEvents } from '../perception/memory.ts';
import { perceive, perceiveMaster } from '../perception/perceive.ts';
import type { MasterView, Perception } from '../perception/types.ts';
import type { BargainPolicyName, Command, ControlCommand } from '../sim/commands.ts';
import { canonicalCommand, SYSTEM_PLAYER } from '../sim/commands.ts';
import type { SimEvent } from '../sim/events.ts';
import { Sim } from '../sim/sim.ts';
import { ticks } from '../sim/time.ts';

/** The player number of the wave master. */
const DIRECTOR_PLAYER = 4;
/** Ability slots whose autocast bit a handover sets. */
const ABILITY_SLOTS = 4;
const HERO_SLOTS = 4;

export interface MatchOptions {
  readonly seed: number;
  readonly game: GameConfig;
  readonly bots: BotSetup;
  /** Set to run the wave master seat; requires `game.master`. */
  readonly director?: DirectorDef;
  readonly perception?: PerceptionDef;
  /** Defaults to `defaultBrains()`. */
  readonly brains?: BrainTable;
  readonly hashEvery?: number;
  /** Slots a human plays from tick 0 (seats for them stay silent); see `Match.setDriven`. */
  readonly driven?: readonly number[];
  /**
   * Who resolves bargain offers: `bots` (default) the bot seats, per `bots.bargain.policy`; `human`
   * nobody here (the shell sends the commands); `off` nobody, offers just lapse.
   */
  readonly bargainPolicy?: BargainPolicy;
  /**
   * Networked play: driven slots and the bargain policy change only through control commands (so
   * every peer changes at the same tick); `setDriven` and `setBargainPolicy` throw.
   */
  readonly networked?: boolean;
}

/** Who resolves bargain offers; see `MatchOptions.bargainPolicy` and `Match.setBargainPolicy`. */
export type BargainPolicy = BargainPolicyName;

/** What the viewer shows for one decision of a seat. */
export interface DecisionView {
  readonly id: string;
  readonly options: readonly { readonly id: string; readonly score: number }[];
  readonly picked: string;
  /** Tick the pick last changed (or was first made). */
  readonly since: number;
}

export interface SeatView {
  readonly slot: number;
  /** Hero entity id. */
  readonly hero: number;
  readonly doctrine: string;
  /** Where the seat holds now (a copy): the brain's moved post if it reports one, else the default post. */
  readonly post: { readonly x: number; readonly y: number };
  /** Doctrine leash, measured from `post`. */
  readonly leash: number;
  /** From the seat's latest think, in the bot's decision order. */
  readonly decisions: readonly DecisionView[];
}

interface Pacing {
  readonly player: number;
  readonly thinkEvery: number;
  readonly delay: number;
  /** Submitted and not yet applied, oldest first. */
  pending: Pended[];
}

interface Pended {
  /** Canonical copy. */
  readonly cmd: Command;
  readonly at: number;
  /** `channelOf(cmd)`; undefined = never deduped. */
  readonly channel: string | undefined;
  /** JSON of the canonical command. */
  readonly key: string;
}

interface Seat extends Pacing {
  readonly slot: number;
  readonly hero: number;
  readonly doctrine: Doctrine;
  readonly post: Point;
  readonly weights: Readonly<Record<string, number>>;
  readonly rng: Rng;
  readonly bot: Bot;
  readonly prev: Map<string, string>;
  decisions: DecisionView[];
  /** A human plays this hero: the seat does not think. */
  driven: boolean;
  /** The hero still has to be put in the state its driver wants (autocast bits, hold). */
  sync: boolean;
}

/** What one think round collects. */
interface Round {
  readonly tick: number;
  readonly seen: Map<string, string>;
  readonly out: SimEvent[];
}

interface DirectorSeat extends Pacing {
  readonly def: DirectorDef;
  readonly rng: Rng;
  readonly director: Director;
}

function pacing(player: number, thinkSeconds: number, reactionSeconds: number): Pacing {
  return {
    player,
    thinkEvery: Math.max(1, ticks(thinkSeconds)),
    delay: Math.max(1, ticks(reactionSeconds)),
    pending: [],
  };
}

/**
 * The dedupe channel of a command: what a later command on the same channel supersedes. Hero
 * commands: kind + hero (+ slot for abilities and autocast); intents: op + hero; bargains: the offer
 * (`bargain:<offer>`, so an accept and a decline of one offer supersede each other). A summon has no
 * channel: two summons are two purchases.
 */
function channelOf(cmd: Command): string | undefined {
  switch (cmd.kind) {
    case 'summon':
      return undefined;
    case 'ability':
    case 'autocast':
      return `${cmd.kind}:${cmd.hero}:${cmd.slot}`;
    case 'intent':
      return `intent:${cmd.op}:${cmd.hero}`;
    case 'move':
    case 'stop':
    case 'hold':
      return `${cmd.kind}:${cmd.hero}`;
    case 'bargain':
      return `bargain:${cmd.offer}`;
    case 'control':
      return cmd.op === 'drive' ? `control:drive:${cmd.slot}` : 'control:bargainPolicy';
    case 'send':
    case 'spawn':
      return cmd.kind;
    case 'callWave':
      return 'wave';
    default: {
      const unknown: never = cmd;
      throw new Error(`unhandled command ${JSON.stringify(unknown)}`);
    }
  }
}

/** Drops what has applied by `tick`, returns copies of what is still pending. */
function inFlight(who: Pacing, tick: number): InFlight[] {
  who.pending = who.pending.filter((e) => e.at > tick);
  return who.pending.map((e) => ({ cmd: { ...e.cmd }, at: e.at }));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) {
      deepFreeze(v);
    }
  }
  return value;
}

function checkSlots(slots: readonly number[]): readonly number[] {
  const seen = new Set<number>();
  for (const slot of slots) {
    if (!(Number.isInteger(slot) && slot >= 0 && slot < HERO_SLOTS) || seen.has(slot)) {
      throw new RangeError(`driven slots must be unique integers 0-${HERO_SLOTS - 1}, got ${slot}`);
    }
    seen.add(slot);
  }
  return slots;
}

function directorSeat(def: DirectorDef | undefined, seed: number, game: GameConfig): DirectorSeat | undefined {
  if (def === undefined) {
    return undefined;
  }
  if (game.master === undefined) {
    throw new RangeError('a Director needs game.master');
  }
  return {
    ...pacing(DIRECTOR_PLAYER, def.thinkSeconds, def.reactionSeconds),
    def,
    rng: deriveRng(seed, 'director'),
    director: createDirector(def),
  };
}

function heroIds(sim: Sim): number[] {
  const out: number[] = [];
  for (const e of sim.entities.values()) {
    if (e.kind === 'hero') {
      out.push(e.id);
    }
  }
  return out;
}

export class Match {
  readonly sim: Sim;
  readonly seed: number;
  readonly #memory: PerceptionMemory;
  readonly #seats: Seat[] = [];
  readonly #director: DirectorSeat | undefined;
  readonly #botPolicy: BargainBotPolicy;
  #bargainPolicy: BargainPolicy;
  readonly #networked: boolean;
  #cached: Perception | undefined;
  #masterCached: { readonly tick: number; readonly view: MasterView | undefined } | undefined;

  constructor(options: MatchOptions) {
    const { seed, game, bots } = options;
    this.seed = seed;
    this.sim = new Sim({ seed, game, ...(options.hashEvery === undefined ? {} : { hashEvery: options.hashEvery }) });
    this.#memory = createMemory(options.perception ?? defaultPerception());
    const brains = options.brains ?? defaultBrains();
    const heroes = heroIds(this.sim);
    const posts = game.map.heroSpawns;
    const drivenAtStart = checkSlots(options.driven ?? []);
    for (const s of bots.seats) {
      const hero = heroes[s.slot];
      const def = game.heroes[s.slot];
      const doctrine = bots.doctrines.find((d) => d.id === s.doctrine);
      const post = posts.length === 0 ? undefined : posts[s.slot % posts.length];
      if (hero === undefined || def === undefined || doctrine === undefined || post === undefined) {
        throw new RangeError(`bad seat: slot ${s.slot}, doctrine '${s.doctrine}'`);
      }
      if (s.slot > 3 || this.#seats.some((o) => o.slot === s.slot)) {
        throw new RangeError(`bad seat: slot ${s.slot} is out of range or taken`);
      }
      const info: SeatInfo = { slot: s.slot, hero, kit: def.kit, post: { x: post.x, y: post.y } };
      this.#seats.push({
        ...pacing(s.slot, bots.thinkSeconds, s.reactionSeconds),
        slot: s.slot,
        hero,
        doctrine,
        post: { x: post.x, y: post.y },
        weights: { ...bots.kitWeights, ...doctrine.weights },
        rng: deriveRng(seed, `bot:${s.slot}`),
        bot: brains[def.kit](info),
        prev: new Map(),
        decisions: [],
        driven: false,
        sync: true,
      });
    }
    this.#seats.sort((a, b) => a.slot - b.slot);
    this.#startDriven(drivenAtStart);
    this.#director = directorSeat(options.director, seed, game);
    this.#botPolicy = bots.bargain?.policy ?? 'evaluate';
    this.#bargainPolicy = options.bargainPolicy ?? 'bots';
    this.#networked = options.networked === true;
  }

  get tick(): number {
    return this.sim.tick;
  }

  /** Who resolves bargain offers now. */
  get bargainPolicy(): BargainPolicy {
    return this.#bargainPolicy;
  }

  /**
   * Hands bargain offers to the bots (`bots`, scored per `bots.bargain.policy`) or to a human (`human`,
   * the shell sends the commands; `off`: nobody, offers lapse). It only changes which commands the bot
   * seats issue from the next think on, never the sim: commands already queued still land, and the
   * game stays a pure function of seed, config and the commands issued.
   */
  setBargainPolicy(policy: BargainPolicy): void {
    this.#refuseWhenNetworked('setBargainPolicy');
    this.#bargainPolicy = policy;
  }

  #refuseWhenNetworked(what: string): void {
    if (this.#networked) {
      throw new Error(`${what} is not allowed in networked play: send a control command`);
    }
  }

  get ended(): boolean {
    return this.sim.ended;
  }

  get seats(): readonly SeatView[] {
    return this.#seats
      .filter((s) => !s.driven)
      .map((s) => ({
        slot: s.slot,
        hero: s.hero,
        doctrine: s.doctrine.id,
        post: { ...s.post },
        leash: s.doctrine.leash,
        decisions: s.decisions,
      }));
  }

  /** The slots a human plays now, ascending. */
  get driven(): readonly number[] {
    return this.#seats.filter((s) => s.driven).map((s) => s.slot);
  }

  /**
   * Sets which hero slots a human plays; every other seat is a bot. Slots without a seat are
   * ignored (nothing to hand over). A seat that changes hands forgets what it was doing (so a
   * returning bot starts from scratch and nothing is deduplicated against a stale order) and the
   * hero is put in its new driver's state by commands, once it is alive to take them: bot ->
   * every autocast bit on, human -> every bit off, hold cleared either way. Bot commands already
   * queued in the sim (at most the bot's reaction delay) still apply.
   */
  setDriven(slots: readonly number[]): void {
    this.#refuseWhenNetworked('setDriven');
    this.#driveSeats(slots);
  }

  #driveSeats(slots: readonly number[]): void {
    const wanted = new Set(checkSlots(slots));
    for (const seat of this.#seats) {
      const driven = wanted.has(seat.slot);
      if (driven === seat.driven) {
        continue;
      }
      seat.driven = driven;
      seat.sync = true;
      seat.pending = [];
      seat.prev.clear();
      seat.decisions = [];
      this.#syncSeat(seat);
    }
  }

  #control(cmd: ControlCommand): void {
    if (cmd.op === 'bargainPolicy') {
      this.#bargainPolicy = cmd.policy;
      return;
    }
    const driven = new Set(this.driven);
    if (cmd.by === 'human') {
      driven.add(cmd.slot);
    } else {
      driven.delete(cmd.slot);
    }
    this.#driveSeats([...driven].sort((a, b) => a - b));
  }

  /** Seats a human plays from the start go quiet; every seat gets its hero put in its driver's state. */
  #startDriven(slots: readonly number[]): void {
    for (const seat of this.#seats) {
      seat.driven = slots.includes(seat.slot);
    }
    this.#syncSeats();
  }

  #syncSeats(): void {
    for (const seat of this.#seats) {
      this.#syncSeat(seat);
    }
  }

  /** Commands that put a live hero in the state its driver expects; a downed hero waits for its respawn. */
  #syncSeat(seat: Seat): void {
    const hero = this.sim.entities.get(seat.hero);
    if (!seat.sync || hero?.kit === undefined || hero.hp <= 0) {
      return;
    }
    seat.sync = false;
    const at = this.sim.tick + 1;
    if (hero.kit.hold) {
      this.sim.command(seat.slot, { kind: 'hold', hero: seat.hero, on: false }, at);
    }
    for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
      const on = !seat.driven;
      if (((hero.kit.autocast >> slot) & 1) === (on ? 0 : 1)) {
        this.sim.command(seat.slot, { kind: 'autocast', hero: seat.hero, slot, on }, at);
      }
    }
  }

  /** Whether the hero's autocast mask lets a bot cast `slot`. */
  #maskAllows(seat: Seat, slot: number): boolean {
    const kit = this.sim.entities.get(seat.hero)?.kit;
    return kit === undefined || ((kit.autocast >> slot) & 1) === 1;
  }

  get directorStatus(): DirectorStatus | undefined {
    return this.#director?.director.status();
  }

  /** Perception of the current tick, computed on first use (memory is folded every tick). */
  get perception(): Perception {
    if (this.#cached?.tick !== this.sim.tick) {
      this.#cached = deepFreeze(perceive(this.sim, this.#memory));
    }
    return this.#cached;
  }

  /** The wave master's view of the current tick (undefined without `game.master`); memoised by tick. */
  get masterView(): MasterView | undefined {
    if (this.#masterCached?.tick !== this.sim.tick) {
      this.#masterCached = { tick: this.sim.tick, view: deepFreeze(perceiveMaster(this.sim)) };
    }
    return this.#masterCached.view;
  }

  step(): SimEvent[] {
    const events = this.sim.step();
    const { tick } = this.sim;
    foldEvents(this.#memory, events, tick);
    // Control commands (SYSTEM_PLAYER only) take effect right after the tick they applied in, so
    // every peer and every replay of the log changes driver or policy at the same tick.
    for (const e of events) {
      if (e.kind === 'cmd' && e.cmd.kind === 'control' && e.player === SYSTEM_PLAYER) {
        this.#control(e.cmd);
      }
    }
    if (this.sim.ended) {
      return events;
    }
    const choices: SimEvent[] = [];
    this.#syncSeats();
    for (const seat of this.#seats) {
      if (!seat.driven && tick % seat.thinkEvery === 0) {
        this.#thinkSeat(seat, tick, choices);
      }
    }
    const dir = this.#director;
    if (dir !== undefined && tick % dir.thinkEvery === 0) {
      this.#thinkDirector(dir, tick);
    }
    return choices.length === 0 ? events : [...events, ...choices];
  }

  #thinkSeat(seat: Seat, tick: number, out: SimEvent[]): void {
    const p = this.perception;
    const me = p.heroes.find((h) => h.id === seat.hero);
    if (me === undefined) {
      seat.decisions = [];
      seat.prev.clear();
      return;
    }
    const ctx: BotCtx = {
      p,
      me,
      doctrine: seat.doctrine,
      weights: seat.weights,
      delay: seat.delay,
      tick,
      inFlight: inFlight(seat, tick),
    };
    const decisions = [
      ...seat.bot.think(ctx),
      ...(this.#decidesBargains(seat, p) ? bargainDecisions(ctx, this.#botPolicy, this.#bargainScope()) : []),
    ];
    const views: DecisionView[] = [];
    const seen = new Map<string, string>();
    const ids = new Set<string>();
    for (const d of decisions) {
      if (ids.has(d.id)) {
        throw new Error(`seat ${seat.slot}: duplicate decision id '${d.id}' in one think`);
      }
      ids.add(d.id);
      views.push(this.#resolve(seat, d, { tick, seen, out }));
    }
    seat.prev.clear();
    for (const [k, v] of seen) {
      seat.prev.set(k, v);
    }
    seat.decisions = views;
  }

  /**
   * Whether `seat` decides the bot-owned offers: policy not `off`, an offer open, and `seat` is the
   * lowest-slot seat a bot plays (not driven) with its hero up. A downed or human-driven seat never
   * decides. What it may resolve is `#bargainScope`.
   */
  #decidesBargains(seat: Seat, p: Perception): boolean {
    if (this.#bargainPolicy === 'off' || p.bargains.open.length === 0) {
      return false;
    }
    const first = this.#seats.find((s) => !s.driven && p.heroes.some((h) => h.id === s.hero));
    return first === seat;
  }

  /** Cards of bot-driven heroes; team cards and Decline only under policy `bots` (else a human decides them). */
  #bargainScope(): BargainScope {
    const bots = new Map<number, number>();
    for (const s of this.#seats) {
      if (!s.driven) {
        bots.set(s.hero, s.slot);
      }
    }
    return { bots, team: this.#bargainPolicy === 'bots' };
  }

  #resolve(seat: Seat, d: Decision, run: Round): DecisionView {
    const { tick, seen, out } = run;
    const prev = seat.prev.get(d.id);
    const pick = decide(d, seat.doctrine, seat.rng, prev);
    const picked = pick.option.id;
    // Only a real choice (2+ options) is remembered: a lone option is not a pick, so a later
    // decision that gains options emits its first `choice`.
    if (d.options.length >= 2) {
      seen.set(d.id, picked);
    }
    const options = d.options.map((o, i) => ({ id: o.id, score: pick.scores[i] ?? 0 }));
    const old = seat.decisions.find((v) => v.id === d.id);
    const changed = prev !== picked;
    if (d.options.length >= 2 && changed) {
      const labelled = labelledOptions(d, options);
      out.push({
        tick,
        kind: 'choice',
        hero: d.hero ?? seat.hero,
        decision: d.id,
        options: labelled,
        picked: pickedLabel(d, picked),
      });
    }
    this.#submit(
      seat,
      pick.option.commands.filter((c) => c.kind !== 'ability' || this.#maskAllows(seat, c.slot)),
      tick,
      pick.option.player,
    );
    return { id: d.id, options, picked, since: old?.picked === picked ? old.since : tick };
  }

  #thinkDirector(dir: DirectorSeat, tick: number): void {
    const master = this.masterView;
    if (master === undefined) {
      return;
    }
    const cmds = dir.director.think({
      p: this.perception,
      master,
      def: dir.def,
      rng: dir.rng,
      tick,
      inFlight: inFlight(dir, tick),
    });
    this.#submit(dir, cmds, tick);
  }

  /**
   * Queues `cmds` for `who` at tick + its delay as `player` (default: its own). A bot never submits
   * for a human-driven slot: such commands are dropped here, whatever asked for them.
   */
  #submit(who: Pacing, cmds: readonly Command[], tick: number, as?: number): void {
    const player = as ?? who.player;
    if (this.#seats.some((s) => s.slot === player && s.driven)) {
      return;
    }
    who.pending = who.pending.filter((e) => e.at > tick);
    for (const cmd of cmds) {
      const canon = canonicalCommand(cmd);
      const channel = channelOf(canon);
      const key = JSON.stringify(canon);
      const last = channel === undefined ? undefined : who.pending.findLast((e) => e.channel === channel);
      if (last?.key === key) {
        continue;
      }
      const at = tick + who.delay;
      if (this.sim.command(player, canon, at).ok) {
        who.pending.push({ cmd: canon, at, channel, key });
      }
    }
  }
}

/** The label `choice` events use for the option with this id. */
function pickedLabel(d: Decision, id: string): string {
  const o = d.options.find((x) => x.id === id);
  return o?.label ?? id;
}

/** Options by label in first-seen order; options sharing a label are one entry with the best score. */
function labelledOptions(
  d: Decision,
  options: readonly { id: string; score: number }[],
): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  options.forEach((o, i) => {
    const label = d.options[i]?.label ?? o.id;
    const at = out.findIndex((x) => x.id === label);
    const seen = out[at];
    if (seen === undefined) {
      out.push({ id: label, score: o.score });
    } else if (o.score > seen.score) {
      seen.score = o.score;
    }
  });
  return out;
}
