// Status system. Owner: combat-core: apply / refresh / expire / remove, and the speed modifiers.
// Instances live in `Entity.statuses`, kept sorted by (status id text, src) so hashing and
// iteration are deterministic; at most one instance per (status, src).

import type { TickContext } from './context.ts';
import type { Entity, StatusInstance } from './entities.ts';

function compare(status: string, src: number, s: StatusInstance): number {
  if (status !== s.status) {
    return status < s.status ? -1 : 1;
  }
  return src - s.src;
}

interface StatusApplication {
  readonly status: string;
  /** Entity that applied it. */
  readonly src: number;
  readonly durationTicks: number;
  readonly value: number;
}

/**
 * Applies a status to `dst`. At most one instance per (status, src): re-applying from the same src
 * refreshes it (`until` = max of old and new, `value` = max of old and new, no new `status` event).
 * Different srcs keep separate instances; readers use the max value (`statusValue`), so effects
 * never stack. No-op on missing or dead targets and on durations under one tick.
 * `durationTicks` must be a whole number of ticks (use `ticks()`).
 */
export function applyStatus(ctx: TickContext, dst: number, app: StatusApplication): void {
  const { status, src, durationTicks, value } = app;
  const target = ctx.entities.get(dst);
  if (target === undefined || target.hp <= 0 || !(durationTicks >= 1)) {
    return;
  }
  const until = ctx.tick + durationTicks;
  let at = 0;
  while (at < target.statuses.length) {
    const cur = target.statuses[at];
    if (cur === undefined || compare(status, src, cur) <= 0) {
      break;
    }
    at += 1;
  }
  const existing = target.statuses[at];
  if (existing !== undefined && compare(status, src, existing) === 0) {
    existing.until = Math.max(existing.until, until);
    existing.value = Math.max(existing.value, value);
    return;
  }
  target.statuses.splice(at, 0, { status, until, src, value });
  ctx.emit({ tick: ctx.tick, kind: 'status', dst, status, on: true, src });
}

export function hasStatus(e: Readonly<Entity>, status: string): boolean {
  return e.statuses.some((s) => s.status === status);
}

/** Largest value among the entity's instances of `status`; 0 if none. */
export function statusValue(e: Readonly<Entity>, status: string): number {
  let best = 0;
  for (const s of e.statuses) {
    if (s.status === status && s.value > best) {
      best = s.value;
    }
  }
  return best;
}

/**
 * Removes `status` instances from `dst` (only those applied by `src` if given), emitting `status`
 * off for each. For consuming Marked, ending a taunt or un-bracing.
 */
export function removeStatus(ctx: TickContext, dst: number, status: string, src?: number): void {
  const target = ctx.entities.get(dst);
  if (target === undefined) {
    return;
  }
  const kept: StatusInstance[] = [];
  for (const s of target.statuses) {
    if (s.status === status && (src === undefined || s.src === src)) {
      ctx.emit({ tick: ctx.tick, kind: 'status', dst, status, on: false, src: s.src });
    } else {
      kept.push(s);
    }
  }
  target.statuses = kept;
}

/**
 * Movement speed (world units per tick) after statuses. `rooted` (the Brace mechanism, also usable
 * by enemy roots) means 0 and blocks hero move commands. `suppressed` removes a fraction of the
 * speed equal to its largest value, clamped to [0, 1]. `taunted` does not affect speed.
 */
export function effectiveSpeed(e: Readonly<Entity>): number {
  if (hasStatus(e, 'rooted')) {
    return 0;
  }
  const slow = Math.min(1, Math.max(0, statusValue(e, 'suppressed')));
  return e.speed * (1 - slow);
}

/** Expires statuses whose time is up (tick order: after waves, before movement). */
export function statusSystem(ctx: TickContext): void {
  for (const e of ctx.entities.values()) {
    if (e.statuses.length === 0) {
      continue;
    }
    const kept: StatusInstance[] = [];
    for (const s of e.statuses) {
      if (s.until > ctx.tick) {
        kept.push(s);
      } else {
        ctx.emit({ tick: ctx.tick, kind: 'status', dst: e.id, status: s.status, on: false, src: s.src });
      }
    }
    e.statuses = kept;
  }
}
