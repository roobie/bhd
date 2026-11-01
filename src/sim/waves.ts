// Wave scheduler. Owner: lane-waves. STUB: waves start on a fixed interval, each spawn group
// releases its units `gap` seconds apart at the start of the lane. The scheduler state is
// hashed here (`hashWaves`) because it is not an entity field.

import type { WaveDef } from '../content/types.ts';
import { findById } from '../content/types.ts';
import type { TickContext } from './context.ts';
import { spawnEnemy } from './enemies.ts';
import type { StateHasher } from './hash.ts';
import { ticks } from './time.ts';

interface SpawnJob {
  /** Tick the unit spawns at. */
  readonly at: number;
  readonly def: string;
}

export interface WaveState {
  /** Waves started so far (the 1-based number of the latest wave). */
  n: number;
  /** Tick the next wave starts at (meaningless once all waves have started). */
  nextAt: number;
  /** Spawns still to happen, ordered by tick, then by release order. */
  queue: SpawnJob[];
}

export function createWaveState(firstAt: number): WaveState {
  return { n: 0, nextAt: firstAt, queue: [] };
}

/** Every field of the state, in fixed order. */
export function hashWaves(h: StateHasher, w: WaveState): void {
  h.u32(w.n).f64(w.nextAt).u32(w.queue.length);
  for (const job of w.queue) {
    h.f64(job.at).str(job.def);
  }
}

/** All waves started and every queued unit spawned. */
export function wavesExhausted(ctx: TickContext): boolean {
  return ctx.waves.n >= ctx.game.waves.waves.length && ctx.waves.queue.length === 0;
}

function startWave(ctx: TickContext, wave: WaveDef): void {
  const w = ctx.waves;
  w.n += 1;
  ctx.emit({
    tick: ctx.tick,
    kind: 'wave',
    n: w.n,
    phase: 'start',
    composition: wave.spawns.map((g) => ({ def: g.def, count: g.count })),
  });
  for (const g of wave.spawns) {
    for (let i = 0; i < g.count; i++) {
      w.queue.push({ at: ctx.tick + ticks(g.gap * i), def: g.def });
    }
  }
  // Array.sort is stable, so equal ticks keep release order.
  w.queue.sort((a, b) => a.at - b.at);
  w.nextAt = ctx.tick + ticks(ctx.game.waves.interval);
}

export function waveSystem(ctx: TickContext): void {
  const w = ctx.waves;
  const next = ctx.game.waves.waves[w.n];
  if (next !== undefined && ctx.tick >= w.nextAt) {
    startWave(ctx, next);
  }
  const [start] = ctx.game.map.lane;
  while (w.queue.length > 0 && (w.queue[0]?.at ?? Number.POSITIVE_INFINITY) <= ctx.tick) {
    const job = w.queue.shift();
    const def = job === undefined ? undefined : findById(ctx.game.enemies, job.def);
    if (def !== undefined && start !== undefined) {
      spawnEnemy(ctx, def, start, 'lane');
    }
  }
}
