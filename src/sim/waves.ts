// Wave scheduler. Owner: lane-waves. Wave n starts at `firstDelay + (n - 1) * interval` seconds
// (`wave` event, phase 'start', with the composition); each spawn group releases its units `gap`
// seconds apart at the start of the lane.
// A wave ENDS (`wave` event, phase 'end', same composition) on the first waves phase after all of
// its units have spawned and every one of them is gone: killed or leaked (missing, or at 0 hp).
// Waves may overlap; each ends on its own. The game's 'victory' waits for the last wave's end.
// In wave master mode (`game.master`, see master.ts) the schedule supplies only the clock and the count.
// The scheduler state is hashed here (`hashWaves`) because it is not an entity field.

import type { WaveDef } from '../content/types.ts';
import { findById } from '../content/types.ts';
import type { TickContext } from './context.ts';
import { spawnEnemy } from './enemies.ts';
import type { StateHasher } from './hash.ts';
import { endedComposition, takePending } from './master.ts';
import { ticks } from './time.ts';

interface SpawnJob {
  /** Tick the unit spawns at. */
  readonly at: number;
  readonly def: string;
  /** 1-based wave the unit belongs to. */
  readonly wave: number;
}

/** A started wave that has not ended yet. */
interface OpenWave {
  readonly n: number;
  /** Units not yet spawned. */
  unspawned: number;
  /** Ids of its spawned units (some may be gone already). */
  ids: number[];
}

export interface WaveState {
  /** Waves started so far (the 1-based number of the latest wave). */
  n: number;
  /** Tick the next wave starts at (meaningless once all waves have started). */
  nextAt: number;
  /** Spawns still to happen, ordered by tick, then by release order. */
  queue: SpawnJob[];
  /** Started waves that have not ended, ascending by number. */
  open: OpenWave[];
}

export function createWaveState(firstAt: number): WaveState {
  return { n: 0, nextAt: firstAt, queue: [], open: [] };
}

/** Every field of the state, in fixed order. */
export function hashWaves(h: StateHasher, w: WaveState): void {
  h.u32(w.n).f64(w.nextAt).u32(w.queue.length);
  for (const job of w.queue) {
    h.f64(job.at).str(job.def).u32(job.wave);
  }
  h.u32(w.open.length);
  for (const o of w.open) {
    h.u32(o.n).u32(o.unspawned).u32(o.ids.length);
    for (const id of o.ids) {
      h.u32(id);
    }
  }
}

/** All waves started, every queued unit spawned and every wave ended. */
export function wavesExhausted(ctx: TickContext): boolean {
  const w = ctx.waves;
  return w.n >= ctx.game.waves.waves.length && w.queue.length === 0 && w.open.length === 0;
}

/** Starts the next wave with composition `wave`: the schedule's, or in master mode the pending one (see master.ts). */
export function startWave(ctx: TickContext, wave: WaveDef): void {
  const w = ctx.waves;
  w.n += 1;
  ctx.emit({
    tick: ctx.tick,
    kind: 'wave',
    n: w.n,
    phase: 'start',
    composition: wave.spawns.map((g) => ({ def: g.def, count: g.count })),
  });
  let unspawned = 0;
  for (const g of wave.spawns) {
    for (let i = 0; i < g.count; i++) {
      w.queue.push({ at: ctx.tick + ticks(g.gap * i), def: g.def, wave: w.n });
      unspawned += 1;
    }
  }
  w.open.push({ n: w.n, unspawned, ids: [] });
  // Array.sort is stable, so equal ticks keep release order.
  w.queue.sort((a, b) => a.at - b.at);
  w.nextAt = ctx.tick + ticks(ctx.game.waves.interval);
}

function isGone(ctx: TickContext, id: number): boolean {
  const e = ctx.entities.get(id);
  return e === undefined || e.hp <= 0;
}

function endFinishedWaves(ctx: TickContext): void {
  const w = ctx.waves;
  const still: OpenWave[] = [];
  for (const o of w.open) {
    if (o.unspawned === 0 && o.ids.every((id) => isGone(ctx, id))) {
      const wave = ctx.game.waves.waves[o.n - 1];
      const composition =
        ctx.master === undefined
          ? (wave?.spawns ?? []).map((g) => ({ def: g.def, count: g.count }))
          : endedComposition(ctx.master, o.n);
      ctx.emit({ tick: ctx.tick, kind: 'wave', n: o.n, phase: 'end', composition });
    } else {
      still.push(o);
    }
  }
  w.open = still;
}

function spawnDue(ctx: TickContext): void {
  const w = ctx.waves;
  const [start] = ctx.game.map.lane;
  while (w.queue.length > 0 && (w.queue[0]?.at ?? Number.POSITIVE_INFINITY) <= ctx.tick) {
    const job = w.queue.shift();
    const def = job === undefined ? undefined : findById(ctx.game.enemies, job.def);
    const open = job === undefined ? undefined : w.open.find((o) => o.n === job.wave);
    if (open !== undefined) {
      open.unspawned -= 1;
    }
    if (def !== undefined && start !== undefined) {
      open?.ids.push(spawnEnemy(ctx, def, start, 'lane').id);
    }
  }
}

export function waveSystem(ctx: TickContext): void {
  const w = ctx.waves;
  const next = ctx.game.waves.waves[w.n];
  if (next !== undefined && ctx.tick >= w.nextAt) {
    // Master mode: the schedule is only the clock; the pending queue is the wave.
    startWave(ctx, ctx.master === undefined ? next : takePending(ctx));
  }
  spawnDue(ctx);
  endFinishedWaves(ctx);
}
