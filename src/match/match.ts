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
//     d = max(1, ticks(reactionSeconds)); a seat dedupes a command identical to one of its own
//     not-yet-applied commands;
//  5. the result is the sim's events followed by `choice` events (tick T).
// Seats: players 0-3 = lineup slots 0-3, player 4 = the Director (needs `game.master`).
// RNG streams: deriveRng(seed, 'bot:<slot>') and deriveRng(seed, 'director'); the sim's is never read.
// A `choice` is emitted for a decision with >= 2 options when it is first evaluated and whenever its
// pick changes; a decision absent from a think is forgotten (its next appearance is "first").

import { defaultBrains } from '../bots/brains.ts';
import type { Bot, BrainTable, Decision, SeatInfo } from '../bots/types.ts';
import { decide } from '../bots/utility.ts';
import type { BotSetup, Doctrine } from '../content/bots.ts';
import type { DirectorDef } from '../content/director.ts';
import type { GameConfig } from '../content/index.ts';
import type { PerceptionDef } from '../content/perception.ts';
import { defaultPerception } from '../content/perception.ts';
import type { Rng } from '../detmath/index.ts';
import { deriveRng } from '../detmath/index.ts';
import type { Director, DirectorStatus } from '../director/director.ts';
import { createDirector } from '../director/director.ts';
import type { PerceptionMemory } from '../perception/memory.ts';
import { createMemory, foldEvents } from '../perception/memory.ts';
import { perceive, perceiveMaster } from '../perception/perceive.ts';
import type { Perception } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import type { SimEvent } from '../sim/events.ts';
import { Sim } from '../sim/sim.ts';
import { ticks } from '../sim/time.ts';

/** The player number of the wave master. */
const DIRECTOR_PLAYER = 4;

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
}

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
  /** From the seat's latest think, in the bot's decision order. */
  readonly decisions: readonly DecisionView[];
}

interface Pacing {
  readonly player: number;
  readonly thinkEvery: number;
  readonly delay: number;
  /** Canonical command text -> the tick it applies at, while not yet applied. */
  readonly pending: Map<string, number>;
}

interface Seat extends Pacing {
  readonly slot: number;
  readonly hero: number;
  readonly doctrine: Doctrine;
  readonly weights: Readonly<Record<string, number>>;
  readonly rng: Rng;
  readonly bot: Bot;
  readonly prev: Map<string, string>;
  decisions: DecisionView[];
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
    pending: new Map(),
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
  #cached: Perception | undefined;

  constructor(options: MatchOptions) {
    const { seed, game, bots } = options;
    this.seed = seed;
    this.sim = new Sim({ seed, game, ...(options.hashEvery === undefined ? {} : { hashEvery: options.hashEvery }) });
    this.#memory = createMemory(options.perception ?? defaultPerception());
    const brains = options.brains ?? defaultBrains();
    const heroes = heroIds(this.sim);
    const posts = game.map.heroSpawns;
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
      const info: SeatInfo = { slot: s.slot, hero, kit: def.kit, post };
      this.#seats.push({
        ...pacing(s.slot, bots.thinkSeconds, s.reactionSeconds),
        slot: s.slot,
        hero,
        doctrine,
        weights: { ...bots.kitWeights, ...doctrine.weights },
        rng: deriveRng(seed, `bot:${s.slot}`),
        bot: brains[def.kit](info),
        prev: new Map(),
        decisions: [],
      });
    }
    this.#seats.sort((a, b) => a.slot - b.slot);
    if (options.director !== undefined) {
      if (game.master === undefined) {
        throw new RangeError('a Director needs game.master');
      }
      const def = options.director;
      this.#director = {
        ...pacing(DIRECTOR_PLAYER, def.thinkSeconds, def.reactionSeconds),
        def,
        rng: deriveRng(seed, 'director'),
        director: createDirector(def),
      };
    }
  }

  get tick(): number {
    return this.sim.tick;
  }

  get ended(): boolean {
    return this.sim.ended;
  }

  get seats(): readonly SeatView[] {
    return this.#seats.map((s) => ({
      slot: s.slot,
      hero: s.hero,
      doctrine: s.doctrine.id,
      decisions: s.decisions,
    }));
  }

  get directorStatus(): DirectorStatus | undefined {
    return this.#director?.director.status();
  }

  /** Perception of the current tick, computed on first use (memory is folded every tick). */
  get perception(): Perception {
    if (this.#cached?.tick !== this.sim.tick) {
      this.#cached = perceive(this.sim, this.#memory);
    }
    return this.#cached;
  }

  step(): SimEvent[] {
    const events = this.sim.step();
    const { tick } = this.sim;
    foldEvents(this.#memory, events, tick);
    if (this.sim.ended) {
      return events;
    }
    const choices: SimEvent[] = [];
    for (const seat of this.#seats) {
      if (tick % seat.thinkEvery === 0) {
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
    const decisions = seat.bot.think({
      p,
      me,
      doctrine: seat.doctrine,
      weights: seat.weights,
      rng: seat.rng,
      tick,
    });
    const views: DecisionView[] = [];
    const seen = new Map<string, string>();
    for (const d of decisions) {
      views.push(this.#resolve(seat, d, { tick, seen, out }));
    }
    seat.prev.clear();
    for (const [k, v] of seen) {
      seat.prev.set(k, v);
    }
    seat.decisions = views;
  }

  #resolve(seat: Seat, d: Decision, run: Round): DecisionView {
    const { tick, seen, out } = run;
    const prev = seat.prev.get(d.id);
    const pick = decide(d, seat.doctrine, seat.rng, prev);
    const picked = pick.option.id;
    seen.set(d.id, picked);
    const options = d.options.map((o, i) => ({ id: o.id, score: pick.scores[i] ?? 0 }));
    const old = seat.decisions.find((v) => v.id === d.id);
    const changed = prev !== picked;
    if (d.options.length >= 2 && changed) {
      out.push({ tick, kind: 'choice', hero: seat.hero, decision: d.id, options, picked });
    }
    this.#submit(seat, pick.option.commands, tick);
    return { id: d.id, options, picked, since: changed || old === undefined ? tick : old.since };
  }

  #thinkDirector(dir: DirectorSeat, tick: number): void {
    const master = perceiveMaster(this.sim);
    if (master === undefined) {
      return;
    }
    const cmds = dir.director.think({ p: this.perception, master, def: dir.def, rng: dir.rng, tick });
    this.#submit(dir, cmds, tick);
  }

  #submit(who: Pacing, cmds: readonly Command[], tick: number): void {
    for (const [key, at] of who.pending) {
      if (at <= tick) {
        who.pending.delete(key);
      }
    }
    for (const cmd of cmds) {
      const key = JSON.stringify(cmd);
      if (!who.pending.has(key)) {
        const at = tick + who.delay;
        this.sim.command(who.player, cmd, at);
        who.pending.set(key, at);
      }
    }
  }
}
