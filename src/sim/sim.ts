// The deterministic simulation core (DESIGN.md §6, §6.1). Pure: no DOM, no wall clock, no
// Math.random, no engine-dependent Math functions, no module-level mutable state. The caller
// (client, reporter, net) drives `step()`; the sim knows nothing about transport.

import type { GameConfig } from '../content/index.ts';
import { validateGame } from '../content/index.ts';
import type { Rng } from '../detmath/index.ts';
import { deriveRng } from '../detmath/index.ts';
import type { Command } from './commands.ts';
import { applyCommand, canonicalCommand, isValidCommand } from './commands.ts';
import type { TickContext } from './context.ts';
import { deathSystem } from './deaths.ts';
import { enemySystem } from './enemies.ts';
import type { EntityView } from './entities.ts';
import { EntityStore } from './entities.ts';
import type { EndReason, SimEvent } from './events.ts';
import { stateHash } from './hash.ts';
import { heroSystem, spawnHero } from './heroes/index.ts';
import { moveSystem } from './movement.ts';
import { statusSystem } from './statuses.ts';
import { ticks } from './time.ts';
import type { WaveState } from './waves.ts';
import { createWaveState, waveSystem } from './waves.ts';

const DEFAULT_HASH_EVERY = 30;

export interface SimOptions {
  /** Game seed (uint32). */
  readonly seed: number;
  /** Content for this game; see src/content (`defaultGame()`). */
  readonly game: GameConfig;
  /** Emit a `hash` event after every tick divisible by this. Default 30 (once per second). */
  readonly hashEvery?: number;
}

export type CommandResult =
  | { readonly ok: true; readonly tick: number; readonly seq: number }
  | { readonly ok: false; readonly reason: 'past' | 'invalid' | 'ended' };

/** What code outside the sim may read. Mutation goes through `command()` only. */
interface SimView {
  readonly tick: number;
  readonly ended: boolean;
  readonly entities: EntityView;
}

interface Pending {
  readonly player: number;
  readonly seq: number;
  readonly cmd: Command;
}

/** Order commands apply in within one tick. */
export function byPlayerThenSeq(
  a: { readonly player: number; readonly seq: number },
  b: { readonly player: number; readonly seq: number },
): number {
  return a.player - b.player || a.seq - b.seq;
}

export class Sim implements SimView {
  readonly seed: number;
  readonly hashEvery: number;
  readonly game: GameConfig;
  readonly entities = new EntityStore();
  readonly rng: Rng;
  readonly waves: WaveState;
  #tick = 0;
  #ended = false;
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
    validateGame(options.game);
    this.game = options.game;
    this.rng = deriveRng(this.seed, 'sim');
    this.waves = createWaveState(ticks(this.game.waves.firstDelay));
    const { ancient } = this.game.map;
    const emit = (event: SimEvent): void => {
      this.#out.push(event);
    };
    // Setup runs as tick 0: the Ancient (id 1), then the lineup in order. Its `spawn` events are
    // returned by the first step().
    const ancientEntity = this.entities.add({
      kind: 'ancient',
      def: 'ancient',
      team: 0,
      x: ancient.x,
      y: ancient.y,
      radius: ancient.radius,
      maxHp: ancient.maxHp,
      armour: 0,
      speed: 0,
    });
    emit({ tick: 0, kind: 'spawn', id: ancientEntity.id, def: ancientEntity.def, team: ancientEntity.team });
    const sim = this;
    this.#ctx = {
      get tick(): number {
        return sim.#tick;
      },
      entities: this.entities,
      rng: this.rng,
      emit,
      game: this.game,
      waves: this.waves,
      ancientId: ancientEntity.id,
      killers: new Map(),
      end: (reason) => {
        sim.#end(reason);
      },
    };
    const spawns = this.game.map.heroSpawns;
    this.game.heroes.forEach((def, i) => {
      const at = spawns[i % spawns.length];
      spawnHero(this.#ctx, def, at?.x ?? ancient.x, at?.y ?? ancient.y);
    });
  }

  /** True once the game has ended; gameplay no longer advances (see `step`). */
  get ended(): boolean {
    return this.#ended;
  }

  #end(reason: EndReason): void {
    if (!this.#ended) {
      this.#ended = true;
      this.#out.push({ tick: this.#tick, kind: 'end', wave: this.waves.n, reason });
    }
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
    if (this.#ended) {
      return { ok: false, reason: 'ended' };
    }
    if (tick <= this.#tick) {
      return { ok: false, reason: 'past' };
    }
    const seq = this.#seq.get(player) ?? 0;
    this.#seq.set(player, seq + 1);
    // Own, -0-free copy: later mutation by the caller must not change what runs or what is
    // logged, and the logged JSON must replay to the same bits.
    const entry: Pending = { player: player + 0, seq, cmd: canonicalCommand(cmd) };
    const list = this.#pending.get(tick);
    if (list === undefined) {
      this.#pending.set(tick, [entry]);
    } else {
      list.push(entry);
    }
    return { ok: true, tick, seq };
  }

  /**
   * Runs one tick and returns its events in emission order. Tick order: commands, waves (spawn),
   * statuses (expire), movement, hero kits, enemies, deaths (+ end), hash. After the game has
   * ended, a tick only advances the clock and emits `hash` events: commands already queued are dropped unlogged and new ones are rejected (`ended`)
   * and no system runs.
   */
  step(): SimEvent[] {
    this.#tick += 1;
    const ctx = this.#ctx;
    if (!this.#ended) {
      this.#runGameplay(ctx);
    }
    if (this.#tick % this.hashEvery === 0) {
      ctx.emit({ tick: this.#tick, kind: 'hash', stateHash: this.hash() });
    }
    const out = this.#out;
    this.#out = [];
    return out;
  }

  #runGameplay(ctx: TickContext): void {
    ctx.killers.clear();
    const due = this.#pending.get(this.#tick);
    if (due !== undefined) {
      this.#pending.delete(this.#tick);
      due.sort(byPlayerThenSeq);
      for (const p of due) {
        ctx.emit({ tick: this.#tick, kind: 'cmd', player: p.player, cmd: p.cmd });
        applyCommand(ctx, p.cmd);
      }
    }
    waveSystem(ctx);
    statusSystem(ctx);
    moveSystem(ctx);
    heroSystem(ctx);
    enemySystem(ctx);
    deathSystem(ctx);
  }

  /** Canonical hash of game state; see `stateHash` for what it covers and in what order. */
  hash(): string {
    return stateHash({
      tick: this.#tick,
      ended: this.#ended,
      entities: this.entities,
      waves: this.waves,
      rng: this.rng,
    });
  }
}
