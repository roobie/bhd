// PerceptionMemory: temporal features folded from the event stream EVERY tick by Match (so lazy
// per-think computation can't change results). `foldEvents` is called once per tick with that
// tick's events, in order. Memory only grows from events and is pruned by age (samples at or before
// `tick - window` drop), so it is a pure function of the event history and the current tick:
// folding tick by tick, or all at once ending at the same tick, gives the same window.

import type { PerceptionDef } from '../content/perception.ts';
import type { SimEvent } from '../sim/events.ts';
import { ticks } from '../sim/time.ts';

interface DamageSample {
  readonly tick: number;
  readonly dst: number;
  readonly amount: number;
}

interface LeakSample {
  readonly tick: number;
  readonly livesLost: number;
}

export interface PerceptionMemory {
  readonly cfg: PerceptionDef;
  /** Damage events inside the memory window, oldest first (any victim; perceive filters to heroes). */
  damage: DamageSample[];
  leaks: LeakSample[];
}

export function createMemory(cfg: PerceptionDef): PerceptionMemory {
  return { cfg, damage: [], leaks: [] };
}

/** Drops the leading samples at or before `oldest`; samples arrive in tick order. */
function prune<T extends { readonly tick: number }>(samples: T[], oldest: number): T[] {
  let n = 0;
  while (n < samples.length && (samples[n]?.tick ?? 0) <= oldest) {
    n += 1;
  }
  return n === 0 ? samples : samples.slice(n);
}

/** Folds the events of `tick` into `memory` and drops samples older than the window. */
export function foldEvents(memory: PerceptionMemory, events: readonly SimEvent[], tick: number): void {
  for (const e of events) {
    if (e.kind === 'dmg') {
      memory.damage.push({ tick: e.tick, dst: e.dst, amount: e.amount });
    } else if (e.kind === 'leak') {
      memory.leaks.push({ tick: e.tick, livesLost: e.livesLost });
    }
  }
  const oldest = tick - ticks(memory.cfg.memorySeconds);
  memory.damage = prune(memory.damage, oldest);
  memory.leaks = prune(memory.leaks, oldest);
}

/** Damage taken by each victim inside the window. */
export function damageByVictim(memory: PerceptionMemory): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of memory.damage) {
    out.set(s.dst, (out.get(s.dst) ?? 0) + s.amount);
  }
  return out;
}

/** Lives lost to leaks inside the window. */
export function livesLost(memory: PerceptionMemory): number {
  return memory.leaks.reduce((n, s) => n + s.livesLost, 0);
}
