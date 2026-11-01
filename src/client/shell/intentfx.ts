// Scene instances for intents and the arm preview. Owner: w7-arming. Called by scene.ts.

import { heroPresentation } from '../../content/presentation.ts';
import type { IntentView } from '../../perception/types.ts';
import { TICK_HZ } from '../../sim/time.ts';
import { ARM_MAX_HALF_SECONDS } from './arming.ts';
import { PALETTE, parseHex, withAlpha } from './palette.ts';
import { type InstanceBuffer, type IntentFxInput, type Rgba, SHAPE } from './types.ts';

/** Marker radius in world units, floored to this many CSS pixels. */
const MARKER_UNITS = 0.5;
const MARKER_MIN_PX = 12;
const PIP_MIN_PX = 3.5;
/** A full ring is this many ticks of countdown (the longest fire time the picker offers). */
const FULL_RING_TICKS = (ARM_MAX_HALF_SECONDS * TICK_HZ) / 2;

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, finite(n, 0)));
}

/** World size of at least `px` CSS pixels (or `units` if larger). */
function sized(units: number, px: number, pxPerUnit: number): number {
  const ppu = pxPerUnit > 0 && Number.isFinite(pxPerUnit) ? pxPerUnit : 1;
  return Math.max(units, px / ppu);
}

interface Marker {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: Rgba;
  /** Ring fill, 0..1. */
  readonly fill: number;
}

function pushMarker(out: InstanceBuffer, m: Marker, thick: number): void {
  const x = finite(m.x, 0);
  const y = finite(m.y, 0);
  out.push({
    x,
    y,
    hw: m.radius,
    hh: m.radius,
    rot: 0,
    shape: SHAPE.circle,
    color: withAlpha(m.color, 0.18),
    p0: 0,
    p1: 0,
  });
  out.push({
    x,
    y,
    hw: m.radius,
    hh: m.radius,
    rot: 0,
    shape: SHAPE.ring,
    color: withAlpha(m.color, 0.5),
    p0: thick,
    p1: 0,
  });
  // The countdown arc starts at +x and runs clockwise; turn it so it starts at the top.
  out.push({
    x,
    y,
    hw: m.radius,
    hh: m.radius,
    rot: -Math.PI / 2,
    shape: SHAPE.arc,
    color: m.color,
    p0: clamp01(m.fill),
    p1: thick * 1.5,
  });
  out.push({ x, y, hw: thick, hh: thick, rot: 0, shape: SHAPE.circle, color: m.color, p0: 0, p1: 0 });
}

function pushPips(input: IntentFxInput, i: IntentView, radius: number, out: InstanceBuffer): void {
  const pip = sized(0.12, PIP_MIN_PX, input.pxPerUnit);
  const n = i.reservers.length;
  for (let k = 0; k < n; k += 1) {
    const heroId = i.reservers[k];
    const hero = input.p.heroes.find((h) => h.id === heroId);
    const color = hero === undefined ? PALETTE.selection : parseHex(heroPresentation(input.ui, hero.def).color);
    const a = Math.PI / 2 + (k - (n - 1) / 2) * ((pip * 2.6) / radius);
    out.push({
      x: finite(i.x, 0) + Math.cos(a) * radius,
      y: finite(i.y, 0) + Math.sin(a) * radius,
      hw: pip,
      hh: pip,
      rot: 0,
      shape: SHAPE.circle,
      color,
      p0: 0,
      p1: 0,
    });
  }
}

/**
 * Appends, in the decal layer: a marker per live intent (point, kind glyph ring, a ring that empties
 * toward `fireTick` using `tickF`, reserver pips in hero colours), and, while `arming.phase` is
 * `aim` or `time`, the preview of the armed cast at (arming.x, arming.y) with its countdown ring.
 * Sizes honour the pixel floor via `pxPerUnit`. Every float finite.
 */
export function intentInstances(input: IntentFxInput, out: InstanceBuffer): void {
  const radius = sized(MARKER_UNITS, MARKER_MIN_PX, input.pxPerUnit);
  const thick = sized(0.06, 1.5, input.pxPerUnit);
  for (const i of input.p.intents) {
    const left = i.fired ? 0 : i.fireTick - finite(input.tickF, input.p.tick);
    const selected = input.arming.phase === 'reserve' && input.arming.intent === i.id;
    const r = selected ? radius * 1.25 : radius;
    const color = i.fired ? withAlpha(PALETTE.intent, 0.4) : PALETTE.intent;
    pushMarker(out, { x: i.x, y: i.y, radius: r, color, fill: left / FULL_RING_TICKS }, thick);
    pushPips(input, i, r, out);
  }
  const a = input.arming;
  if (a.phase === 'aim' || a.phase === 'time') {
    const fill = (a.fireHalfSeconds * TICK_HZ) / 2 / FULL_RING_TICKS;
    pushMarker(out, { x: a.x, y: a.y, radius, color: PALETTE.aimDecal, fill }, thick);
  }
}
