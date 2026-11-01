// Snapshots of the sim for drawing, and render-time effects from events. Owner: w7-viewmath.
// Read-only on the sim: nothing here mutates it.

import type { Entity } from '../../sim/entities.ts';
import type { SimEvent } from '../../sim/events.ts';
import type { Sim } from '../../sim/sim.ts';
import type { Effect, EntitySnap, Snapshot } from './types.ts';

const HIT_MS = 120;
const CAST_MS = 250;
const DEATH_MS = 150;
/** Centre distance (world units) beyond which a damaging hit counts as ranged and gets a tracer. */
const RANGED_MIN_DIST = 3;
/** Tracer speed (world units per second) and its flight-time clamp (ms). */
const SHOT_SPEED = 70;
const SHOT_MIN_MS = 100;
const SHOT_MAX_MS = 220;
/** Live tracers allowed at once, so a big wave cannot flood the instance buffer. */
const MAX_SHOTS = 48;
/** Squared distance below which an entity counts as not having moved. */
const MOVED_EPS2 = 1e-12;

function activeStatuses(e: Readonly<Entity>, tick: number): string[] {
  const ids = new Set<string>();
  for (const s of e.statuses) {
    if (tick < s.until) {
      ids.add(s.status);
    }
  }
  return [...ids].sort();
}

function facingOf(sim: Sim, e: Readonly<Entity>, before: EntitySnap | undefined): number {
  if (before !== undefined) {
    const dx = e.x - before.x;
    const dy = e.y - before.y;
    if (dx * dx + dy * dy > MOVED_EPS2) {
      return Math.atan2(dy, dx);
    }
  }
  const target = e.attack.target === 0 ? undefined : sim.entities.get(e.attack.target);
  if (target !== undefined) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    if (dx !== 0 || dy !== 0) {
      return Math.atan2(dy, dx);
    }
  }
  return before === undefined ? 0 : before.facing;
}

/**
 * The drawable state of `sim` now (live entities in ascending id order; `facing` per the
 * `EntitySnap` contract, using `prev` for the movement direction and the last facing).
 */
export function takeSnapshot(sim: Sim, prev: Snapshot | undefined): Snapshot {
  const before = new Map<number, EntitySnap>();
  for (const e of prev?.entities ?? []) {
    before.set(e.id, e);
  }
  const entities: EntitySnap[] = [];
  for (const e of sim.entities.values()) {
    if (e.hp <= 0) {
      continue;
    }
    entities.push({
      id: e.id,
      kind: e.kind,
      def: e.def,
      team: e.team,
      x: e.x,
      y: e.y,
      radius: e.radius,
      hpFrac: e.maxHp > 0 ? Math.min(Math.max(e.hp / e.maxHp, 0), 1) : 0,
      facing: facingOf(sim, e, before.get(e.id)),
      statuses: activeStatuses(e, sim.tick),
    });
  }
  entities.sort((a, b) => a.id - b.id);
  return { tick: sim.tick, entities };
}

function effectFor(kind: Effect['kind'], who: EntitySnap, nowMs: number, durationMs: number): Effect {
  return { kind, id: who.id, x: who.x, y: who.y, radius: who.radius, startMs: nowMs, durationMs };
}

/** `dmg` tags that mark a hit as something other than a basic autoattack: no tracer for these. */
const NOT_AUTOATTACK_TAGS: readonly string[] = ['melee', 'leak', 'cone'];

/** True for a `dmg` that came from a basic ranged autoattack (not melee, leak, cone or an ability). */
function isAutoattack(tags: readonly string[]): boolean {
  return !tags.some((t) => NOT_AUTOATTACK_TAGS.includes(t) || t.startsWith('ability:'));
}

/**
 * Advances the effect list: drops finished effects (`nowMs >= startMs + durationMs`), then adds one
 * per relevant event in `events` (`dmg` -> hit on the target, 120 ms; `ability` -> cast on the
 * caster, 250 ms; `death` -> death ghost at the entity's position in `snap`, 150 ms). A `dmg` that is a
 * basic ranged autoattack (no `melee`, `leak`, `cone` or `ability:*` tag, across a gap over
 * `RANGED_MIN_DIST`) also adds one `shot` tracer per source per frame (calls sharing `nowMs` count as one
 * frame), 100-220 ms, at most `MAX_SHOTS` live; its hit and the target's death start when the tracer
 * lands. Events naming an entity that is not in `snap` are skipped.
 *
 * Dead entities are removed from the sim in the tick they die, so `snap` must be the snapshot taken
 * BEFORE the step that produced `events` (the predecessor), where the entity was last seen; the
 * position is then at most one tick stale.
 */
export function advanceEffects(
  effects: readonly Effect[],
  events: readonly SimEvent[],
  snap: Snapshot,
  nowMs: number,
): Effect[] {
  const out = effects.filter((f) => nowMs < f.startMs + f.durationMs);
  const byId = new Map<number, EntitySnap>();
  for (const e of snap.entities) {
    byId.set(e.id, e);
  }
  const frameShooters = new Set<number>();
  for (const f of out) {
    if (f.kind === 'shot' && f.startMs === nowMs) {
      frameShooters.add(f.id);
    }
  }
  const run: Run = {
    out,
    byId,
    nowMs,
    frameShooters,
    shots: out.filter((f) => f.kind === 'shot').length,
    landing: new Map(),
  };
  for (const ev of events) {
    applyEvent(run, ev);
  }
  return out;
}

interface Run {
  readonly out: Effect[];
  readonly byId: ReadonlyMap<number, EntitySnap>;
  readonly nowMs: number;
  /** Sources that already have a tracer this frame. */
  readonly frameShooters: Set<number>;
  shots: number;
  /** Target id -> ms until its tracer lands, for the hit and death effects. */
  readonly landing: Map<number, number>;
}

function push(run: Run, who: EntitySnap | undefined, spec: { kind: Effect['kind']; delay: number; ms: number }): void {
  if (who !== undefined) {
    run.out.push(effectFor(spec.kind, who, run.nowMs + spec.delay, spec.ms));
  }
}

function applyEvent(run: Run, ev: SimEvent): void {
  if (ev.kind === 'dmg') {
    const shot = isAutoattack(ev.tags)
      ? shotFor(run.byId.get(ev.src), run.byId.get(ev.dst), ev.dst, run.nowMs)
      : undefined;
    if (shot !== undefined) {
      run.landing.set(ev.dst, shot.durationMs);
      if (!run.frameShooters.has(ev.src) && run.shots < MAX_SHOTS) {
        run.frameShooters.add(ev.src);
        run.shots += 1;
        run.out.push(shot);
      }
    }
    push(run, run.byId.get(ev.dst), { kind: 'hit', delay: shot?.durationMs ?? 0, ms: HIT_MS });
  } else if (ev.kind === 'ability') {
    push(run, run.byId.get(ev.hero), { kind: 'cast', delay: 0, ms: CAST_MS });
  } else if (ev.kind === 'death') {
    push(run, run.byId.get(ev.id), { kind: 'death', delay: run.landing.get(ev.id) ?? 0, ms: DEATH_MS });
  }
}

/** A tracer for a hit across a gap wider than melee, else undefined. */
function shotFor(
  from: EntitySnap | undefined,
  to: EntitySnap | undefined,
  toId: number,
  nowMs: number,
): Effect | undefined {
  if (from === undefined || to === undefined || from.id === to.id) {
    return undefined;
  }
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(dist > RANGED_MIN_DIST)) {
    return undefined;
  }
  return {
    ...effectFor('shot', from, nowMs, Math.min(SHOT_MAX_MS, Math.max(SHOT_MIN_MS, (dist / SHOT_SPEED) * 1000))),
    toX: to.x,
    toY: to.y,
    toId,
    srcKind: from.kind,
    srcDef: from.def,
  };
}
