// The scene: drawn entities + perception + controls -> instances in world space. Owner: w7-scene.
// Pure: reads only its input, writes only `out`. Colours and labels come from palette.ts and the
// presentation fallbacks; nothing here switches on a hero, kit, effect or status name.

import {
  enemyPresentation,
  heroPresentation,
  resourcePresentation,
  statusPresentation,
} from '../../content/presentation.ts';
import type { HeroView, Perception } from '../../perception/types.ts';
import { intentInstances } from './intentfx.ts';
import { PALETTE, parseHex, withAlpha } from './palette.ts';
import type { Effect, EntitySnap, Instance, InstanceBuffer, Rgba, SceneInput, ShapeId } from './types.ts';
import { SHAPE } from './types.ts';

/** Pixel floor for body radii, pips and markers (css px). */
export const MIN_BODY_PX = 6;

/** Half angle of the generic cone preview for a directional ability (radians). */
const CONE_HALF_ANGLE = 0.4;
const MAX_PIPS = 4;
const LANE_HALF_WIDTH = 1.5;

interface Part {
  readonly shape: ShapeId;
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh?: number;
  readonly rot?: number;
  readonly color: Rgba;
  readonly p0?: number;
  readonly p1?: number;
}

function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, fin(v, 0)));
}

function emit(out: InstanceBuffer, p: Part): void {
  const hw = Math.max(0, fin(p.hw, 0));
  const inst: Instance = {
    x: fin(p.x, 0),
    y: fin(p.y, 0),
    hw,
    hh: Math.max(0, fin(p.hh ?? hw, hw)),
    rot: fin(p.rot ?? 0, 0),
    shape: p.shape,
    color: [clamp01(p.color[0]), clamp01(p.color[1]), clamp01(p.color[2]), clamp01(p.color[3])],
    p0: fin(p.p0 ?? 0, 0),
    p1: fin(p.p1 ?? 0, 0),
  };
  out.push(inst);
}

/** World units for `px` css pixels (a usable scale even if the camera is degenerate). */
function pxToWorld(px: number, pxPerUnit: number): number {
  return px / (pxPerUnit > 0 && Number.isFinite(pxPerUnit) ? pxPerUnit : 1);
}

/** `units` raised to at least the pixel floor. */
function floored(units: number, pxPerUnit: number): number {
  return Math.max(fin(units, 0), pxToWorld(MIN_BODY_PX, pxPerUnit));
}

function ground(input: SceneInput, out: InstanceBuffer): void {
  const { map, camera } = input;
  emit(out, {
    shape: SHAPE.box,
    x: map.width / 2,
    y: map.height / 2,
    hw: map.width / 2,
    hh: map.height / 2,
    color: PALETTE.ground,
  });
  const half = floored(LANE_HALF_WIDTH, camera.pxPerUnit);
  for (let i = 1; i < map.lane.length; i++) {
    const a = map.lane[i - 1];
    const b = map.lane[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    emit(out, {
      shape: SHAPE.segment,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      hw: Math.hypot(dx, dy) / 2,
      rot: Math.atan2(dy, dx),
      color: PALETTE.lane,
      p0: half,
    });
  }
  const r = floored(map.ancient.radius, camera.pxPerUnit);
  emit(out, {
    shape: SHAPE.circle,
    x: map.ancient.x,
    y: map.ancient.y,
    hw: r,
    color: withAlpha(PALETTE.ancient, 0.35),
  });
  emit(out, {
    shape: SHAPE.ring,
    x: map.ancient.x,
    y: map.ancient.y,
    hw: r,
    color: PALETTE.ancient,
    p0: pxToWorld(2, camera.pxPerUnit),
  });
}

function selectedHero(input: SceneInput): HeroView | undefined {
  return input.p.heroes.find((h) => h.slot === input.controls.selected);
}

function rangeDecals(hero: HeroView, input: SceneInput, out: InstanceBuffer): void {
  const thick = pxToWorld(1.5, input.camera.pxPerUnit);
  for (const a of hero.abilities) {
    if (a.range > 0) {
      emit(out, { shape: SHAPE.ring, x: hero.x, y: hero.y, hw: a.range, color: PALETTE.rangeDecal, p0: thick });
    }
  }
}

function aimPreview(hero: HeroView, input: SceneInput, out: InstanceBuffer): void {
  const { aim, cursor } = input.controls;
  if (aim === undefined || cursor === undefined) {
    return;
  }
  const ability = hero.abilities.find((a) => a.slot === aim.slot);
  if (ability === undefined) {
    return;
  }
  const dx = cursor.x - hero.x;
  const dy = cursor.y - hero.y;
  const ppu = input.camera.pxPerUnit;
  const reach = ability.range > 0 ? ability.range : Math.hypot(dx, dy);
  const r = floored(ability.radius, ppu);
  switch (aim.targeting) {
    case 'direction':
      emit(out, {
        shape: SHAPE.sector,
        x: hero.x,
        y: hero.y,
        hw: reach,
        rot: Math.atan2(dy, dx),
        color: PALETTE.aimDecal,
        p0: CONE_HALF_ANGLE,
      });
      break;
    case 'point':
      emit(out, { shape: SHAPE.circle, x: cursor.x, y: cursor.y, hw: r, color: PALETTE.aimDecal });
      emit(out, {
        shape: SHAPE.ring,
        x: cursor.x,
        y: cursor.y,
        hw: r,
        color: withAlpha(PALETTE.aimDecal, 0.9),
        p0: pxToWorld(2, ppu),
      });
      break;
    case 'unit':
      emit(out, {
        shape: SHAPE.ring,
        x: cursor.x,
        y: cursor.y,
        hw: floored(0, ppu) * 1.5,
        color: PALETTE.aimDecal,
        p0: pxToWorld(2, ppu),
      });
      break;
    case 'instant':
      emit(out, { shape: SHAPE.circle, x: hero.x, y: hero.y, hw: r, color: PALETTE.aimDecal });
      break;
    default:
      break;
  }
}

function decals(input: SceneInput, out: InstanceBuffer): void {
  const hero = selectedHero(input);
  if (hero !== undefined) {
    rangeDecals(hero, input, out);
    aimPreview(hero, input, out);
  }
  intentInstances(
    {
      p: input.p,
      arming: input.controls.arming,
      selected: input.controls.selected,
      driven: input.driven,
      ui: input.ui,
      tickF: input.tickF,
      pxPerUnit: input.camera.pxPerUnit,
      cursor: input.controls.cursor,
    },
    out,
  );
}

function bodyStyle(input: SceneInput, e: EntitySnap): { color: Rgba; shape: 'circle' | 'box' | 'triangle' } {
  if (e.kind === 'hero') {
    const u = heroPresentation(input.ui, e.def);
    return { color: parseHex(u.color), shape: u.shape ?? 'circle' };
  }
  if (e.kind === 'enemy') {
    const u = enemyPresentation(input.ui, e.def);
    return { color: parseHex(u.color), shape: u.shape ?? 'circle' };
  }
  return { color: PALETTE.ancient, shape: 'circle' };
}

/** The Pavise look: a soft glow slab, a bright core wall and two end posts. */
function propBody(input: SceneInput, e: EntitySnap, r: number, out: InstanceBuffer): void {
  const ppu = input.camera.pxPerUnit;
  const pulse = 0.5 + 0.5 * Math.sin(fin(input.nowMs, 0) / 260);
  const glow = withAlpha(mix(PALETTE.ancient, WHITE, 0.3), 0.16 + 0.08 * pulse);
  emit(out, { shape: SHAPE.segment, x: e.x, y: e.y, hw: r, rot: e.facing, color: glow, p0: pxToWorld(9, ppu) });
  emit(out, {
    shape: SHAPE.segment,
    x: e.x,
    y: e.y,
    hw: r,
    rot: e.facing,
    color: mix(PALETTE.ancient, WHITE, 0.55),
    p0: pxToWorld(3, ppu),
  });
  for (const sign of [-1, 1]) {
    emit(out, {
      shape: SHAPE.circle,
      x: e.x + Math.cos(e.facing) * r * sign,
      y: e.y + Math.sin(e.facing) * r * sign,
      hw: pxToWorld(3.5, ppu),
      color: mix(PALETTE.ancient, WHITE, 0.8),
    });
  }
}

function body(input: SceneInput, e: EntitySnap, out: InstanceBuffer): void {
  if (e.kind === 'ancient') {
    return;
  }
  const r = floored(e.radius, input.camera.pxPerUnit);
  if (e.kind === 'prop') {
    propBody(input, e, r, out);
    return;
  }
  const { color: base, shape } = bodyStyle(input, e);
  const color = e.kind === 'hero' && e.hpFrac <= 0 ? withAlpha(base, 0.25) : base;
  if (shape === 'box') {
    emit(out, { shape: SHAPE.box, x: e.x, y: e.y, hw: r, hh: r, rot: e.facing, color, p0: r * 0.2 });
  } else if (shape === 'triangle') {
    emit(out, { shape: SHAPE.triangle, x: e.x, y: e.y, hw: r * 1.2, hh: r, rot: e.facing, color });
  } else {
    emit(out, { shape: SHAPE.circle, x: e.x, y: e.y, hw: r, color });
  }
}

function statusesOf(p: Perception, e: EntitySnap): readonly string[] {
  if (e.statuses.length > 0) {
    return e.statuses;
  }
  const views = p.heroes.find((h) => h.id === e.id) ?? p.enemies.find((n) => n.id === e.id);
  return views?.statuses.map((s) => s.status) ?? [];
}

function heroOverlays(input: SceneInput, hero: HeroView, e: EntitySnap, out: InstanceBuffer): void {
  const ppu = input.camera.pxPerUnit;
  const r = floored(e.radius, ppu);
  const thick = pxToWorld(3, ppu);
  hero.resources.forEach((res, i) => {
    const rp = resourcePresentation(input.ui, res.name);
    emit(out, {
      shape: SHAPE.arc,
      x: e.x,
      y: e.y,
      hw: r + thick * (2.2 + i * 1.4),
      color: parseHex(rp.color),
      p0: clamp01(res.frac),
      p1: thick * 0.8,
    });
  });
  if (hero.slot === input.controls.selected) {
    emit(out, {
      shape: SHAPE.ring,
      x: e.x,
      y: e.y,
      hw: r + thick * 2,
      color: PALETTE.selection,
      p0: pxToWorld(2, ppu),
    });
  }
}

const WHITE: Rgba = [1, 1, 1, 1];

type StatusLook = 'tint' | 'ring' | 'pulse' | 'chain' | 'crosshair';

/** How each combo status reads on the body; statuses not listed keep only their pip. */
const STATUS_LOOK: Readonly<Record<string, StatusLook>> = {
  exposed: 'pulse',
  clumped: 'tint',
  taunted: 'ring',
  rooted: 'chain',
  marked: 'crosshair',
  suppressed: 'tint',
};

function statusVisuals(input: SceneInput, e: EntitySnap, ids: readonly string[], out: InstanceBuffer): void {
  const ppu = input.camera.pxPerUnit;
  const r = floored(e.radius, ppu);
  const beat = 0.5 + 0.5 * Math.sin(fin(input.nowMs, 0) / 140);
  for (const id of ids) {
    const look = STATUS_LOOK[id];
    if (look === undefined) {
      continue;
    }
    const color = parseHex(statusPresentation(input.ui, id).color);
    const at = { x: e.x, y: e.y };
    switch (look) {
      case 'tint':
        emit(out, { shape: SHAPE.circle, ...at, hw: r * 1.7, color: withAlpha(color, 0.22) });
        break;
      case 'ring':
        emit(out, { shape: SHAPE.ring, ...at, hw: r * 1.9, color: withAlpha(color, 0.9), p0: pxToWorld(2.5, ppu) });
        break;
      case 'pulse':
        emit(out, {
          shape: SHAPE.ring,
          ...at,
          hw: r * (1.6 + 0.35 * beat),
          color: withAlpha(color, 0.5 + 0.4 * beat),
          p0: pxToWorld(2, ppu),
        });
        break;
      case 'chain':
        for (const rot of [Math.PI / 4, -Math.PI / 4]) {
          emit(out, {
            shape: SHAPE.segment,
            ...at,
            hw: r * 1.5,
            rot,
            color: withAlpha(color, 0.9),
            p0: pxToWorld(1.5, ppu),
          });
        }
        break;
      case 'crosshair':
        emit(out, { shape: SHAPE.ring, ...at, hw: r * 1.8, color: withAlpha(color, 0.85), p0: pxToWorld(1.5, ppu) });
        for (const rot of [0, Math.PI / 2]) {
          emit(out, {
            shape: SHAPE.segment,
            ...at,
            hw: r * 2.4,
            rot,
            color: withAlpha(color, 0.8),
            p0: pxToWorld(1, ppu),
          });
        }
        break;
      default:
        break;
    }
  }
}

function overlays(input: SceneInput, e: EntitySnap, out: InstanceBuffer): void {
  if (e.kind === 'prop') {
    return;
  }
  const ppu = input.camera.pxPerUnit;
  const r = floored(e.radius, ppu);
  const thick = pxToWorld(3, ppu);
  const ring = r + thick;
  if (e.hpFrac < 1 || e.kind !== 'enemy') {
    emit(out, { shape: SHAPE.arc, x: e.x, y: e.y, hw: ring, color: PALETTE.hpBack, p0: 1, p1: thick });
    emit(out, { shape: SHAPE.arc, x: e.x, y: e.y, hw: ring, color: PALETTE.hpFill, p0: clamp01(e.hpFrac), p1: thick });
  }
  const hero = input.p.heroes.find((h) => h.id === e.id);
  if (hero !== undefined) {
    heroOverlays(input, hero, e, out);
  }
  if (e.kind !== 'ancient') {
    const m = pxToWorld(MIN_BODY_PX / 2, ppu);
    emit(out, {
      shape: SHAPE.triangle,
      x: e.x + Math.cos(e.facing) * (r + m),
      y: e.y + Math.sin(e.facing) * (r + m),
      hw: m,
      hh: m * 0.7,
      rot: e.facing,
      color: withAlpha(PALETTE.selection, 0.6),
    });
  }
  const all = statusesOf(input.p, e);
  statusVisuals(input, e, all, out);
  const pips = all.slice(0, MAX_PIPS);
  const pr = pxToWorld(MIN_BODY_PX / 2, ppu);
  pips.forEach((id, i) => {
    const s = statusPresentation(input.ui, id);
    emit(out, {
      shape: SHAPE.circle,
      x: e.x + (i - (pips.length - 1) / 2) * pr * 2.4,
      y: e.y - ring - pr * 1.6,
      hw: pr,
      color: parseHex(s.color),
    });
  });
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];
}

function shotColor(input: SceneInput, fx: Effect): Rgba {
  if (fx.srcKind === 'hero') {
    return parseHex(heroPresentation(input.ui, fx.srcDef ?? '').color);
  }
  if (fx.srcKind === 'enemy') {
    return parseHex(enemyPresentation(input.ui, fx.srcDef ?? '').color);
  }
  return PALETTE.ancient;
}

/** Where a tracer endpoint is drawn now: the entity's interpolated position, else the stored point. */
function drawnPoint(
  input: SceneInput,
  id: number | undefined,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  const e = id === undefined ? undefined : input.entities.find((d) => d.id === id);
  return e === undefined ? fallback : { x: fin(e.x, fallback.x), y: fin(e.y, fallback.y) };
}

/** Tracer length floor (css px) and half-widths: a bright streak that reads at phone and desktop sizes. */
const SHOT_TRAIL_PX = 44;
const SHOT_WIDTH_PX = 2.5;
const SHOT_HEAD_PX = 6;

/** Tracer: a long glowing streak trailing a bright white-hot head, flying from the source to the target. */
function shotInstances(input: SceneInput, fx: Effect, age: number, out: InstanceBuffer): void {
  const ppu = input.camera.pxPerUnit;
  const from = drawnPoint(input, fx.id, fx);
  const to = drawnPoint(input, fx.toId, { x: fin(fx.toX ?? fx.x, fx.x), y: fin(fx.toY ?? fx.y, fx.y) });
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const at = (d: number): { x: number; y: number } => ({
    x: from.x + (len > 0 ? ((to.x - from.x) / len) * d : 0),
    y: from.y + (len > 0 ? ((to.y - from.y) / len) * d : 0),
  });
  const headD = len * age;
  const tailD = Math.max(0, headD - Math.max(pxToWorld(SHOT_TRAIL_PX, ppu), len * 0.5));
  const head = at(headD);
  const tail = at(tailD);
  const color = shotColor(input, fx);
  const fade = Math.min(1, (1 - age) * 4);
  const rot = Math.atan2(to.y - from.y, to.x - from.x);
  const mid = { x: (head.x + tail.x) / 2, y: (head.y + tail.y) / 2 };
  const hw = (headD - tailD) / 2;
  emit(out, {
    shape: SHAPE.segment,
    x: mid.x,
    y: mid.y,
    hw,
    rot,
    color: withAlpha(color, 0.35 * fade),
    p0: pxToWorld(SHOT_WIDTH_PX * 2.2, ppu),
  });
  emit(out, {
    shape: SHAPE.segment,
    x: mid.x,
    y: mid.y,
    hw,
    rot,
    color: withAlpha(mix(color, WHITE, 0.35), 0.95 * fade),
    p0: pxToWorld(SHOT_WIDTH_PX, ppu),
  });
  emit(out, {
    shape: SHAPE.circle,
    x: head.x,
    y: head.y,
    hw: pxToWorld(SHOT_HEAD_PX, ppu),
    color: withAlpha(WHITE, fade),
  });
}

function effectInstance(input: SceneInput, fx: Effect, out: InstanceBuffer): void {
  const age = (input.nowMs - fx.startMs) / Math.max(1, fx.durationMs);
  if (!(age >= 0 && age <= 1)) {
    return;
  }
  const ppu = input.camera.pxPerUnit;
  const r = floored(fx.radius, ppu);
  const fade = 1 - age;
  switch (fx.kind) {
    case 'hit':
      emit(out, {
        shape: SHAPE.circle,
        x: fx.x,
        y: fx.y,
        hw: r,
        color: withAlpha(PALETTE.hitFlash, PALETTE.hitFlash[3] * fade),
      });
      break;
    case 'cast':
      emit(out, {
        shape: SHAPE.ring,
        x: fx.x,
        y: fx.y,
        hw: r * (1 + age),
        color: withAlpha(PALETTE.selection, 0.8 * fade),
        p0: pxToWorld(2, ppu),
      });
      break;
    case 'death':
      emit(out, {
        shape: SHAPE.ring,
        x: fx.x,
        y: fx.y,
        hw: r * (1 + age * 0.5),
        color: withAlpha(PALETTE.hitFlash, 0.6 * fade),
        p0: pxToWorld(3, ppu),
      });
      break;
    case 'shot':
      shotInstances(input, fx, age, out);
      break;
    case 'respawn':
      emit(out, {
        shape: SHAPE.ring,
        x: fx.x,
        y: fx.y,
        hw: r * (2 - age),
        color: withAlpha(PALETTE.selection, 0.9 * fade),
        p0: pxToWorld(3, ppu),
      });
      break;
    case 'backlash':
      emit(out, { shape: SHAPE.circle, x: fx.x, y: fx.y, hw: r * (1.2 + age), color: withAlpha(WHITE, 0.55 * fade) });
      emit(out, {
        shape: SHAPE.ring,
        x: fx.x,
        y: fx.y,
        hw: r * (1.5 + 1.5 * age),
        color: withAlpha([1, 0.45, 0.2, 1], 0.9 * fade),
        p0: pxToWorld(3, ppu),
      });
      break;
    case 'nova':
      emit(out, {
        shape: SHAPE.ring,
        x: fx.x,
        y: fx.y,
        hw: Math.max(pxToWorld(MIN_BODY_PX, ppu), fx.radius * age),
        color: withAlpha([1, 0.85, 0.5, 1], 0.9 * fade),
        p0: pxToWorld(4, ppu) * fade + pxToWorld(1, ppu),
      });
      break;
    case 'prop':
      emit(out, {
        shape: SHAPE.ring,
        x: fx.x,
        y: fx.y,
        hw: r * (1 + age),
        color: withAlpha(PALETTE.ancient, 0.7 * fade),
        p0: pxToWorld(2, ppu),
      });
      break;
    default:
      break;
  }
}

/**
 * Appends one frame of instances to `out` (the caller clears it first), in painter's order:
 * ground (map rect, lane segments, Ancient), decals (ranges, aim previews, then
 * `intentInstances` from intentfx.ts), bodies, overlays (hp arcs, status pips, selection ring,
 * facing marks, effects). Sizes below `MIN_BODY_PX` css pixels are raised to it via
 * `input.camera.pxPerUnit`. Reads colours and labels only through content/presentation.ts
 * fallback lookups; never switches on a hero, kit, effect or status name. Every float finite;
 * every shape id one of `SHAPE`.
 */
export function buildScene(input: SceneInput, out: InstanceBuffer): void {
  ground(input, out);
  decals(input, out);
  for (const e of input.entities) {
    body(input, e, out);
  }
  for (const e of input.entities) {
    overlays(input, e, out);
  }
  for (const fx of input.effects) {
    effectInstance(input, fx, out);
  }
}
