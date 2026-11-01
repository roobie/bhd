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
const SHOT_MIN_MS = 80;
const SHOT_MAX_MS = 200;
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

/**
 * Advances the effect list: drops finished effects (`nowMs >= startMs + durationMs`), then adds one
 * per relevant event in `events` (`dmg` -> hit on the target, 120 ms; `ability` -> cast on the
 * caster, 250 ms; `death` -> death ghost at the entity's position in `snap`, 150 ms; a `dmg` across a gap over
 * `RANGED_MIN_DIST` also -> one `shot` tracer per source per call, 80-200 ms, at most `MAX_SHOTS` live). Events naming
 * an entity that is not in `snap` are skipped.
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
  let shots = out.filter((f) => f.kind === 'shot').length;
  const shooters = new Set<number>();
  for (const ev of events) {
    let who: EntitySnap | undefined;
    let kind: Effect['kind'] | undefined;
    let ms = 0;
    switch (ev.kind) {
      case 'dmg':
        who = byId.get(ev.dst);
        kind = 'hit';
        ms = HIT_MS;
        break;
      case 'ability':
        who = byId.get(ev.hero);
        kind = 'cast';
        ms = CAST_MS;
        break;
      case 'death':
        who = byId.get(ev.id);
        kind = 'death';
        ms = DEATH_MS;
        break;
      default:
        break;
    }
    if (who !== undefined && kind !== undefined) {
      out.push(effectFor(kind, who, nowMs, ms));
    }
    if (ev.kind === 'dmg') {
      const shot = shotFor(byId.get(ev.src), byId.get(ev.dst), nowMs);
      if (shot !== undefined && !shooters.has(ev.src) && shots < MAX_SHOTS) {
        shooters.add(ev.src);
        shots += 1;
        out.push(shot);
      }
    }
  }
  return out;
}

/** A tracer for a hit across a gap wider than melee, else undefined. */
function shotFor(from: EntitySnap | undefined, to: EntitySnap | undefined, nowMs: number): Effect | undefined {
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
    srcKind: from.kind,
    srcDef: from.def,
  };
}
