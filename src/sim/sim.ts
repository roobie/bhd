// The deterministic simulation core (DESIGN.md §6, §6.1). Pure: no DOM, no wall clock, no
// Math.random, no engine-dependent Math functions, no module-level mutable state. The caller
// (client, reporter, net) drives `step()`; the sim knows nothing about transport.

import type { Rng } from '../detmath/index.ts';
import { deriveRng } from '../detmath/index.ts';
import type { Command } from './commands.ts';
import { applyCommand, isValidCommand } from './commands.ts';
import type { TickContext } from './context.ts';
import type { EntityView } from './entities.ts';
import { ENTITY_TYPE_CODE, EntityStore } from './entities.ts';
import type { SimEvent } from './events.ts';
import { StateHasher } from './hash.ts';
import { moveSystem } from './movement.ts';

export const TICK_HZ = 30;
const DEFAULT_HASH_EVERY = 30;

export interface SimOptions {
  /** Game seed (uint32). */
  readonly seed: number;
  /** Emit a `hash` event after every tick divisible by this. Default 30 (once per second). */
  readonly hashEvery?: number;
}

export type CommandResult =
  | { readonly ok: true; readonly tick: number; readonly seq: number }
  | { readonly ok: false; readonly reason: 'past' | 'invalid' };

/** What code outside the sim may read. Mutation goes through `command()` only. */
interface SimView {
  readonly tick: number;
  readonly entities: EntityView;
}

interface Pending {
  readonly player: number;
  readonly seq: number;
  readonly cmd: Command;
}

function byPlayerThenSeq(a: Pending, b: Pending): number {
  return a.player - b.player || a.seq - b.seq;
}

export class Sim implements SimView {
  readonly seed: number;
  readonly hashEvery: number;
  readonly entities = new EntityStore();
  readonly rng: Rng;
  #tick = 0;
  /** Commands keyed by the tick they apply at. */
  readonly #pending = new Map<number, Pending[]>();
  /** Next submission sequence number per player. */
  readonly #seq = new Map<number, number>();
  #out: SimEvent[] = [];
  readonly #ctx: TickContext;

  constructor(options: SimOptions) {
    const hashEvery = options.hashEvery ?? DEFAULT_HASH_EVERY;
    if (!(Number.isSafeInteger(hashEvery) && hashEvery > 0)) {
      throw new RangeError(`hashEvery must be a positive integer, got ${hashEvery}`);
    }
    this.seed = options.seed >>> 0;
    this.hashEvery = hashEvery;
    this.rng = deriveRng(this.seed, 'sim');
    const sim = this;
    this.#ctx = {
      get tick(): number {
        return sim.#tick;
      },
      entities: this.entities,
      rng: this.rng,
      emit: (event) => {
        this.#out.push(event);
      },
    };
  }

  /** Last completed tick; 0 before the first `step()`. */
  get tick(): number {
    return this.#tick;
  }

  /**
   * Schedules `cmd` from `player` for `tick` (default: the next tick to run). Lockstep callers pass
   * the delayed tick. Commands for a tick already run are rejected and never logged. Within a tick,
   * commands apply in (player, seq) order, where seq counts that player's accepted submissions; so
   * only each player's own submission order matters, not how players interleave.
   */
  command(player: number, cmd: Command, tick: number = this.#tick + 1): CommandResult {
    if (!(Number.isSafeInteger(player) && player >= 0 && Number.isSafeInteger(tick) && isValidCommand(cmd))) {
      return { ok: false, reason: 'invalid' };
    }
    if (tick <= this.#tick) {
      return { ok: false, reason: 'past' };
    }
    const seq = this.#seq.get(player) ?? 0;
    this.#seq.set(player, seq + 1);
    // Own copy: later mutation by the caller must not change what runs or what is logged.
    const entry: Pending = { player, seq, cmd: structuredClone(cmd) };
    const list = this.#pending.get(tick);
    if (list === undefined) {
      this.#pending.set(tick, [entry]);
    } else {
      list.push(entry);
    }
    return { ok: true, tick, seq };
  }

  /** Runs one tick and returns its events in emission order. */
  step(): SimEvent[] {
    this.#tick += 1;
    const ctx = this.#ctx;
    const due = this.#pending.get(this.#tick);
    if (due !== undefined) {
      this.#pending.delete(this.#tick);
      due.sort(byPlayerThenSeq);
      for (const p of due) {
        ctx.emit({ tick: this.#tick, kind: 'cmd', player: p.player, cmd: p.cmd });
        applyCommand(ctx, p.cmd);
      }
    }
    moveSystem(ctx);
    if (this.#tick % this.hashEvery === 0) {
      ctx.emit({ tick: this.#tick, kind: 'hash', stateHash: this.hash() });
    }
    const out = this.#out;
    this.#out = [];
    return out;
  }

  /**
   * Canonical hash of game state: tick, entity store (next ID, count, each entity in ID order with
   * floats by exact bits) and sim RNG state. Pending commands are excluded on purpose: in lockstep,
   * future inputs arrive at different times on different peers without being a desync.
   */
  hash(): string {
    const h = new StateHasher();
    h.u32(this.#tick).u32(this.entities.nextId).u32(this.entities.size);
    for (const e of this.entities.values()) {
      h.u32(e.id).u32(ENTITY_TYPE_CODE[e.type]).f64(e.x).f64(e.y).f64(e.speed).bool(e.moving).f64(e.tx).f64(e.ty);
    }
    for (const w of this.rng.state) {
      h.u32(w);
    }
    return h.digest();
  }
}
