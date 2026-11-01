// PerceptionMemory: temporal features folded from the event stream EVERY tick by Match (so lazy
// per-think computation can't change results). STUB (basic and working): the perception slice owns
// it. Contract: `foldEvents` is called once per tick with that tick's events, in order; memory only
// grows from events and is pruned by age, so it is a function of the event history.

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
  /** Damage events inside the memory window (any victim; perceive filters to heroes). */
  damage: DamageSample[];
  leaks: LeakSample[];
}

export function createMemory(cfg: PerceptionDef): PerceptionMemory {
  return { cfg, damage: [], leaks: [] };
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
  memory.damage = memory.damage.filter((s) => s.tick > oldest);
  memory.leaks = memory.leaks.filter((s) => s.tick > oldest);
}
