// Wave master, sim side (wave w2-bots DESIGN "Wave master in the sim, Director outside"). Hashed.
// STUB: a small working version so the contract and the all-bot Match run; the director slice
// completes and tests it. Owner: director.
//
// Contract: when `game.master` is set, the wave schedule supplies only the clock (`waves.nextAt`)
// and the wave count; each wave's composition is the pending queue.
// - Budget: wave 1's budget is granted at game start, wave n+1's when wave n starts (see
//   `MasterDef.budgetPerWave`); unspent budget carries over.
// - `summon {def, count}`: spends `count * cost(def)` into the pending wave (merging with a group of
//   the same def). Unknown def, a def not unlocked yet for the wave being
//   bought (`MasterDef.costs[].unlockWave`), over budget or no wave left to buy: a logged no-op (the
//   `cmd` event is logged, nothing changes).
// - `send {}`: starts the pending wave now, only if at least `minIntervalSeconds` have passed since
//   the last wave started, pending is non-empty and waves remain. Otherwise a logged no-op. The next
//   wave's clock restarts from now (see waves.ts `startWave`).
// - At the clock the pending wave starts as it is (possibly empty).
// - `started` keeps the composition of waves that have started and not ended, for the `wave end` event.
// Wave-end semantics (D-FZ2FXOOFFRB5P2YL) are unchanged. A field added to `MasterState` MUST be
// added to `hashMaster` (L-53OTZPIIVO2XYNNL).

import type { MasterDef } from '../content/director.ts';
import type { WaveDef } from '../content/types.ts';
import type { SummonCommand } from './commands.ts';
import type { TickContext } from './context.ts';
import type { StateHasher } from './hash.ts';
import { ticks } from './time.ts';

export interface PendingGroup {
  readonly def: string;
  count: number;
}

export interface MasterState {
  budget: number;
  /** The wave being bought, in the order first summoned. */
  pending: PendingGroup[];
  /** Tick the latest wave started at (0 before the first). */
  lastStart: number;
  /** Started, not yet ended waves: their compositions by 1-based number, ascending. */
  started: { readonly n: number; readonly composition: PendingGroup[] }[];
}

/** Budget granted for wave `n` (1-based). */
function budgetFor(def: MasterDef, n: number): number {
  const list = def.budgetPerWave;
  return list[Math.min(n, list.length) - 1] ?? 0;
}

export function createMasterState(def: MasterDef): MasterState {
  return { budget: budgetFor(def, 1), pending: [], lastStart: 0, started: [] };
}

export function hashMaster(h: StateHasher, m: MasterState): void {
  h.f64(m.budget).f64(m.lastStart).u32(m.pending.length);
  for (const g of m.pending) {
    h.str(g.def).u32(g.count);
  }
  h.u32(m.started.length);
  for (const s of m.started) {
    h.u32(s.n).u32(s.composition.length);
    for (const g of s.composition) {
      h.str(g.def).u32(g.count);
    }
  }
}

/** `summon` command handler. */
export function applySummon(ctx: TickContext, cmd: SummonCommand): void {
  const { master } = ctx;
  const def = ctx.game.master;
  if (master === undefined || def === undefined || ctx.waves.n >= ctx.game.waves.waves.length) {
    return;
  }
  const entry = def.costs.find((c) => c.def === cmd.def);
  // The wave being bought is the next one to start: ctx.waves.n + 1.
  if (entry === undefined || (entry.unlockWave ?? 1) > ctx.waves.n + 1 || entry.cost * cmd.count > master.budget) {
    return;
  }
  master.budget -= entry.cost * cmd.count;
  const group = master.pending.find((g) => g.def === cmd.def);
  if (group === undefined) {
    master.pending.push({ def: cmd.def, count: cmd.count });
  } else {
    group.count += cmd.count;
  }
}

/** Takes the pending wave (clearing it), grants the next wave's budget, and returns it as a wave to start. */
export function takePending(ctx: TickContext): WaveDef {
  const { master } = ctx;
  const def = ctx.game.master;
  if (master === undefined || def === undefined) {
    return { spawns: [] };
  }
  const taken = master.pending;
  master.pending = [];
  master.lastStart = ctx.tick;
  const n = ctx.waves.n + 1;
  master.started.push({ n, composition: taken.map((g) => ({ def: g.def, count: g.count })) });
  master.budget += budgetFor(def, n + 1);
  return { spawns: taken.map((g) => ({ def: g.def, count: g.count, gap: def.gap })) };
}

/**
 * `send` command handler: the wave to start now, if the send is allowed. Allowed once
 * `minIntervalSeconds` have passed since the previous wave started (`lastStart` is 0 at game
 * start), so wave 1 can start by `send` after `minIntervalSeconds`, before `waves.firstDelay` when
 * that is longer.
 */
export function sendWave(ctx: TickContext): WaveDef | undefined {
  const { master } = ctx;
  const def = ctx.game.master;
  if (master === undefined || def === undefined || master.pending.length === 0) {
    return undefined;
  }
  if (ctx.waves.n >= ctx.game.waves.waves.length || ctx.tick - master.lastStart < ticks(def.minIntervalSeconds)) {
    return undefined;
  }
  return takePending(ctx);
}

/** Composition of wave `n` for its `wave end` event, forgetting it. Empty if unknown. */
export function endedComposition(master: MasterState, n: number): PendingGroup[] {
  const i = master.started.findIndex((s) => s.n === n);
  if (i < 0) {
    return [];
  }
  return master.started.splice(i, 1)[0]?.composition ?? [];
}
