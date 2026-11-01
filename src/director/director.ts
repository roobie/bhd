// The Director: the wave master seat (player 4). Owner: director. `createDirector(def)` returns a
// Director whose `think` runs on its think ticks (from `Match`) and returns commands (`summon` /
// `send` only) that Match submits after the Director's own reaction delay. Pure function of
// (perception, master view, own state, own rng). `status()` is read by the viewer.
// The Director paces for tension and never plays to win: it buys units in build, sends the pending
// wave early at peak, and saves money in relax (`DirectorDef.keepFrac`). It counts its own
// in-flight summons against the budget and never sends twice, so it does not double-spend.
// Pacing: a send is only issued if it would apply inside the send window, i.e. at or after
// `master.sendAt` and before the clock starts the wave anyway (`master.nextAt`).

import type { InFlight } from '../bots/types.ts';
import type { DirectorDef } from '../content/director.ts';
import type { Rng } from '../detmath/index.ts';
import { nextFloat } from '../detmath/index.ts';
import type { MasterView, Perception } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import { ticks } from '../sim/time.ts';
import type { TensionPhase } from './tension.ts';
import { createTension, updateTension } from './tension.ts';

interface DirectorCtx {
  readonly p: Perception;
  readonly master: MasterView;
  readonly def: DirectorDef;
  readonly rng: Rng;
  /** The tick whose state `p` describes. */
  readonly tick: number;
  /** The Director's own commands submitted but not yet applied (copies), oldest first. */
  readonly inFlight: readonly InFlight[];
}

export interface DirectorStatus {
  readonly tension: number;
  readonly phase: TensionPhase;
}

export interface Director {
  think: (ctx: DirectorCtx) => Command[];
  status: () => DirectorStatus;
}

function unitCost(master: MasterView, def: string): number {
  return master.costs.find((c) => c.def === def)?.cost ?? Number.POSITIVE_INFINITY;
}

/** First wave `def` may be bought for; never for a def the master cannot summon. */
function unlockWave(master: MasterView, def: string): number {
  return master.costs.find((c) => c.def === def)?.unlockWave ?? Number.POSITIVE_INFINITY;
}

/** Money committed by summons not yet applied. */
function inFlightSpend(ctx: DirectorCtx): number {
  let sum = 0;
  for (const f of ctx.inFlight) {
    if (f.cmd.kind === 'summon') {
      sum += unitCost(ctx.master, f.cmd.def) * f.cmd.count;
    }
  }
  return sum;
}

function pendingUnits(ctx: DirectorCtx): number {
  let n = 0;
  for (const g of ctx.master.pending) {
    n += g.count;
  }
  for (const f of ctx.inFlight) {
    if (f.cmd.kind === 'summon') {
      n += f.cmd.count;
    }
  }
  return n;
}

function pendingCost(master: MasterView): number {
  let sum = 0;
  for (const g of master.pending) {
    sum += unitCost(master, g.def) * g.count;
  }
  return sum;
}

/** Picks a def by weight among `candidates`; one rng draw. */
function pickWeighted(candidates: readonly { readonly def: string; readonly weight: number }[], rng: Rng): string {
  let total = 0;
  for (const c of candidates) {
    total += c.weight;
  }
  let roll = nextFloat(rng) * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll < 0) {
      return c.def;
    }
  }
  return candidates.at(-1)?.def ?? '';
}

function buy(ctx: DirectorCtx, phase: TensionPhase, spent: number): Command[] {
  const { master, def } = ctx;
  const budget = master.budget - spent;
  const keep = def.keepFrac[phase] * (budget + pendingCost(master) + spent);
  const avail = budget - keep;
  // The wave being bought is the one after those already started.
  const wave = ctx.p.wave.n + 1;
  const candidates = def.mix.filter(
    (m) => unlockWave(master, m.def) <= wave && m.weight > 0 && unitCost(master, m.def) <= avail,
  );
  if (candidates.length === 0) {
    return [];
  }
  const pick = pickWeighted(candidates, ctx.rng);
  const cost = unitCost(master, pick);
  const count = Math.min(def.maxPerThink, Math.floor(avail / cost));
  return count >= 1 ? [{ kind: 'summon', def: pick, count }] : [];
}

export function createDirector(def: DirectorDef): Director {
  const tension = createTension();
  const delay = Math.max(1, ticks(def.reactionSeconds));
  return {
    think(ctx) {
      updateTension(tension, ctx.p, def, def.thinkSeconds);
      if (ctx.master.wavesLeft <= 0 || ctx.inFlight.some((f) => f.cmd.kind === 'send')) {
        return [];
      }
      if (tension.phase === 'peak') {
        const applyAt = ctx.tick + delay;
        if (pendingUnits(ctx) > 0 && applyAt >= ctx.master.sendAt && applyAt < ctx.master.nextAt) {
          return [{ kind: 'send' }];
        }
      }
      return buy(ctx, tension.phase, inFlightSpend(ctx));
    },
    status: () => ({ tension: tension.value, phase: tension.phase }),
  };
}
