// The effective hero def at a tick of a logged game: the resolved base def with the bargains accepted
// so far patched in. Metrics that read a hero def number (Warp threshold, Pain knobs, max hp) go
// through here so an accepted bargain moves them. It uses the same `effectiveDef` as the sim, the HUD
// and help (content/bargains.ts), fed from the log's `bargain` events: `accept` adds a bargain,
// an `expire` that carries a `card` (a timed bargain ending, not an offer window lapsing) removes it.

import { type AppliedEffects, type BargainDef, effectiveDef } from '../../content/bargains.ts';
import type { HeroDef } from '../../content/index.ts';
import type { GameLog } from '../types.ts';

interface Step {
  /** From this tick on (inclusive). */
  readonly tick: number;
  readonly taken: readonly AppliedEffects[];
}

const cache = new WeakMap<GameLog, readonly Step[]>();

interface Live {
  readonly offer: number;
  readonly applied: AppliedEffects;
}

type BargainEvent = Extract<GameLog['events'][number], { kind: 'bargain' }>;

/** Applies one `bargain` event to the live list; true when the list changed. */
function advance(live: Live[], e: BargainEvent, pool: readonly BargainDef[]): boolean {
  if (e.op === 'accept') {
    const def = pool.find((b) => b.id === e.card);
    if (def === undefined) {
      return false;
    }
    live.push({ offer: e.offer, applied: { hero: e.hero ?? 0, effects: [...def.gains, ...def.costs] } });
    return true;
  }
  const at = e.op === 'expire' ? live.findIndex((l) => l.offer === e.offer) : -1;
  if (at < 0) {
    return false;
  }
  live.splice(at, 1);
  return true;
}

/** The bargains live after each accept / timed expiry, in order. */
function stepsOf(log: GameLog): readonly Step[] {
  const cached = cache.get(log);
  if (cached !== undefined) {
    return cached;
  }
  const pool = log.header.resolved.game.bargains?.pool ?? [];
  const live: Live[] = [];
  const steps: Step[] = [{ tick: 0, taken: [] }];
  for (const e of log.events) {
    if (e.kind === 'bargain' && e.card !== undefined && advance(live, e, pool)) {
      steps.push({ tick: e.tick, taken: live.map((l) => l.applied) });
    }
  }
  cache.set(log, steps);
  return steps;
}

/**
 * The def of hero entity `entity` (content def id `defId`) at `tick` with the accepted bargains
 * patched in; undefined when the game has no such hero def.
 */
export function heroDefAt(log: GameLog, entity: number, defId: string, tick: number): HeroDef | undefined {
  const base = log.header.resolved.game.heroes.find((h) => h.id === defId);
  if (base === undefined) {
    return undefined;
  }
  let taken: readonly AppliedEffects[] = [];
  for (const s of stepsOf(log)) {
    if (s.tick > tick) {
      break;
    }
    ({ taken } = s);
  }
  return effectiveDef(base, taken, entity);
}
