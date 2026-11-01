// The shared index of one game log, built once per log (WeakMap-cached) and read by every metric:
// entity -> def / team / max hp, an hp tracker (damage clamped at 0, heal, death), the wave in force,
// the Ancient's and the heroes' hp fraction and the enemies alive after each event.
// All per-event arrays are indexed like `log.events`. Pure.

import type { GameLog } from '../types.ts';

interface EntityInfo {
  readonly id: number;
  readonly def: string;
  readonly team: 0 | 1;
  readonly maxHp: number;
  readonly spawnTick: number;
  /** Tick of death or leak; undefined while it lived to the end of the game. */
  deathTick: number | undefined;
  readonly isHero: boolean;
}

export interface GameIndex {
  readonly log: GameLog;
  readonly entities: ReadonlyMap<number, EntityInfo>;
  readonly heroes: readonly EntityInfo[];
  readonly endTick: number;
  readonly ancientId: number;
  /** Hp actually removed by a `dmg` event (clamped at the target's remaining hp), else 0. */
  readonly effDamage: Float64Array;
  /** Wave number in force after the event (0 before the first wave). */
  readonly wave: Int32Array;
  /** Ancient hp / max hp after the event. */
  readonly ancientFrac: Float64Array;
  /** Sum of hero hp / sum of hero max hp after the event (1 when there are no heroes). */
  readonly teamFrac: Float64Array;
  readonly enemiesAlive: Int32Array;
}

const cache = new WeakMap<GameLog, GameIndex>();

function maxHpOf(log: GameLog, def: string): number {
  const { game } = log.header.resolved;
  if (def === 'ancient') {
    return game.map.ancient.maxHp;
  }
  const hero = game.heroes.find((h) => h.id === def);
  if (hero !== undefined) {
    return hero.maxHp;
  }
  return game.enemies.find((e) => e.id === def)?.maxHp ?? Number.POSITIVE_INFINITY;
}

/** The running hp state while the events are walked in order. */
class Tracker {
  readonly entities = new Map<number, EntityInfo>();
  readonly hp = new Map<number, number>();
  ancientId = 0;
  wave = 0;
  heroHp = 0;
  heroMax = 0;
  enemies = 0;

  readonly #log: GameLog;
  readonly #heroIds: ReadonlySet<string>;

  constructor(log: GameLog, heroIds: ReadonlySet<string>) {
    this.#log = log;
    this.#heroIds = heroIds;
  }

  spawn(e: { readonly id: number; readonly def: string; readonly team: 0 | 1; readonly tick: number }): void {
    const isHero = e.team === 0 && this.#heroIds.has(e.def);
    const maxHp = maxHpOf(this.#log, e.def);
    this.entities.set(e.id, {
      id: e.id,
      def: e.def,
      team: e.team,
      maxHp,
      spawnTick: e.tick,
      deathTick: undefined,
      isHero,
    });
    this.hp.set(e.id, maxHp);
    if (e.def === 'ancient') {
      this.ancientId = e.id;
    }
    if (isHero) {
      this.heroHp += maxHp;
      this.heroMax += maxHp;
    }
    if (e.team === 1) {
      this.enemies += 1;
    }
  }

  /** Applies a clamped hp change and returns it. */
  private change(id: number, delta: number): number {
    this.hp.set(id, (this.hp.get(id) ?? 0) + delta);
    if (this.entities.get(id)?.isHero === true) {
      this.heroHp += delta;
    }
    return delta;
  }

  /** Removes hp, never below 0 (a dead or unknown target loses nothing); returns what was removed. */
  damage(id: number, amount: number): number {
    if (!(this.entities.has(id) && amount > 0)) {
      return 0;
    }
    const eff = Math.min(amount, this.hp.get(id) ?? 0);
    this.change(id, -eff);
    return eff;
  }

  heal(id: number, amount: number): void {
    const info = this.entities.get(id);
    if (info !== undefined && info.deathTick === undefined && amount > 0) {
      this.change(id, Math.min(amount, info.maxHp - (this.hp.get(id) ?? 0)));
    }
  }

  /** Death or leak: the entity is gone and its hp is 0. */
  remove(id: number, tick: number): void {
    const info = this.entities.get(id);
    if (info === undefined || info.deathTick !== undefined) {
      return;
    }
    info.deathTick = tick;
    if (info.team === 1) {
      this.enemies -= 1;
    }
    this.change(id, -(this.hp.get(id) ?? 0));
  }

  ancientFrac(): number {
    const anc = this.entities.get(this.ancientId);
    return anc === undefined ? 1 : (this.hp.get(this.ancientId) ?? 0) / anc.maxHp;
  }

  teamFrac(): number {
    return this.heroMax > 0 ? Math.max(0, this.heroHp) / this.heroMax : 1;
  }
}

export function buildIndex(log: GameLog): GameIndex {
  const cached = cache.get(log);
  if (cached !== undefined) {
    return cached;
  }
  const { events } = log;
  const t = new Tracker(log, new Set(log.header.resolved.game.heroes.map((h) => h.id)));
  const effDamage = new Float64Array(events.length);
  const wave = new Int32Array(events.length);
  const ancientFrac = new Float64Array(events.length);
  const teamFrac = new Float64Array(events.length);
  const enemiesAlive = new Int32Array(events.length);

  events.forEach((e, i) => {
    if (e.kind === 'spawn') {
      t.spawn(e);
    } else if (e.kind === 'dmg') {
      effDamage[i] = t.damage(e.dst, e.amount);
    } else if (e.kind === 'heal') {
      t.heal(e.dst, e.amount);
    } else if (e.kind === 'death' || e.kind === 'leak') {
      t.remove(e.id, e.tick);
    } else if (e.kind === 'wave' && e.phase === 'start') {
      t.wave = e.n;
    }
    wave[i] = t.wave;
    ancientFrac[i] = t.ancientFrac();
    teamFrac[i] = t.teamFrac();
    enemiesAlive[i] = t.enemies;
  });

  const index: GameIndex = {
    log,
    entities: t.entities,
    heroes: [...t.entities.values()].filter((x) => x.isHero),
    endTick: log.header.end.tick,
    ancientId: t.ancientId,
    effDamage,
    wave,
    ancientFrac,
    teamFrac,
    enemiesAlive,
  };
  cache.set(log, index);
  return index;
}

/** Def of an entity id, or `?` when the log never spawned it. */
export function defOf(ix: GameIndex, id: number): string {
  return ix.entities.get(id)?.def ?? '?';
}
