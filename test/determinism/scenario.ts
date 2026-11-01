// The shared determinism scenario. Runs unchanged in Node and in browsers (no Node imports), and
// both compare its result to golden.ts: that is how "browser matches Node" is proven.

import { defaultGame } from '../../src/content/index.ts';
import {
  atan2,
  cos,
  createRng,
  deriveRng,
  hypot,
  nextFloat,
  nextInt,
  nextU32,
  PI,
  sin,
} from '../../src/detmath/index.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { StateHasher } from '../../src/sim/hash.ts';
import { Sim } from '../../src/sim/sim.ts';

export const SEED = 0x5e_ed_12_34;
export const TICKS = 1500;
const HASH_EVERY = 37;

export interface Scripted {
  readonly tick: number;
  readonly player: number;
  readonly cmd: Command;
}

// defaultGame() ids: Ancient 1, then the lineup gunner 2, tank 3, ranged 4, support 5; debug spawns
// below get 6, 7, 8, ... in order. Waves start on their own at tick 150.
/** Several players, some on the same tick, hero commands of every kind, targets near and far. */
export const SCRIPT: readonly Scripted[] = [
  { tick: 1, player: 0, cmd: { kind: 'spawn', def: 'grunt', x: 70, y: 25 } },
  { tick: 1, player: 1, cmd: { kind: 'spawn', def: 'brute', x: 72, y: 31.5 } },
  { tick: 1, player: 2, cmd: { kind: 'spawn', def: 'runner', x: -5.5, y: 8.25 } },
  { tick: 2, player: 1, cmd: { kind: 'move', hero: 3, x: 70, y: 28 } },
  { tick: 2, player: 0, cmd: { kind: 'move', hero: 2, x: 60 + 1 / 3, y: 21 } },
  // The Gunner braces and at once unbraces (rooted until tick 34), so the same-tick moves at tick 40 still take effect.
  { tick: 3, player: 2, cmd: { kind: 'ability', hero: 2, slot: 0, x: 50, y: 20 } },
  { tick: 4, player: 2, cmd: { kind: 'ability', hero: 2, slot: 0 } },
  { tick: 5, player: 2, cmd: { kind: 'move', hero: 4, x: 76.5, y: 24 } },
  { tick: 5, player: 2, cmd: { kind: 'hold', hero: 5, on: true } },
  { tick: 17, player: 0, cmd: { kind: 'spawn', def: 'grunt', x: 60.456, y: 5.9 } },
  { tick: 18, player: 1, cmd: { kind: 'move', hero: 5, x: 80.1, y: 27.2 } },
  { tick: 18, player: 0, cmd: { kind: 'move', hero: 5, x: 82, y: 30 } },
  { tick: 18, player: 2, cmd: { kind: 'move', hero: 99, x: 1, y: 1 } },
  // Same player, same tick: only the submission order (seq) says which target wins.
  { tick: 40, player: 0, cmd: { kind: 'move', hero: 2, x: 55, y: 30.7 } },
  { tick: 40, player: 0, cmd: { kind: 'move', hero: 2, x: 58, y: 27 } },
  { tick: 120, player: 0, cmd: { kind: 'ability', hero: 2, slot: 2, x: 40, y: 28 } },
  { tick: 130, player: 0, cmd: { kind: 'ability', hero: 2, slot: 1, x: 40, y: 28 } },
  { tick: 40, player: 1, cmd: { kind: 'move', hero: 3, x: 70 + 2 / 3, y: 28 - 1 / 7 } },
  { tick: 41, player: 2, cmd: { kind: 'spawn', def: 'grunt', x: 2, y: 2 } },
  { tick: 50, player: 0, cmd: { kind: 'ability', hero: 4, slot: 3, target: 6 } },
  { tick: 55, player: 1, cmd: { kind: 'autocast', hero: 3, slot: 1, on: true } },
  { tick: 55, player: 1, cmd: { kind: 'autocast', hero: 3, slot: 2, on: false } },
  // Negative zero: JSON turns it into 0, so the sim must have normalised it before logging.
  { tick: 60, player: 1, cmd: { kind: 'spawn', def: 'runner', x: -0, y: -0 } },
  { tick: 61, player: 1, cmd: { kind: 'move', hero: 5, x: -0, y: 25 } },
  { tick: 61, player: 1, cmd: { kind: 'ability', hero: 4, slot: 1, x: -0, y: -0 } },
  { tick: 90, player: 1, cmd: { kind: 'stop', hero: 2 } },
  { tick: 100, player: 1, cmd: { kind: 'hold', hero: 5, on: false } },
  { tick: 150, player: 2, cmd: { kind: 'move', hero: 3, x: 75, y: 30 } },
  { tick: 150, player: 0, cmd: { kind: 'move', hero: 2, x: 62, y: 20.5 } },
  { tick: 299, player: 1, cmd: { kind: 'hold', hero: 2, on: true } },
  { tick: 600, player: 1, cmd: { kind: 'hold', hero: 2, on: false } },
  { tick: 700, player: 2, cmd: { kind: 'ability', hero: 2, slot: 3 } },
];

export interface ScenarioResult {
  /** `stateHash` of every hash event, in order. */
  readonly hashes: readonly string[];
  /** Digest of the full event stream (every event, every field). */
  readonly eventDigest: string;
  /** detmath outputs: RNG draws, then trig values, as `String(x)` (shortest text that round-trips the double). */
  readonly detmath: readonly string[];
  /** Bitwise digest of detmath over a dense sweep plus edge values (tiny, huge, ±0, axes, infinities). */
  readonly detmathSweep: string;
}

/** Hashes the JSON text of `value` code unit by code unit. */
function digestOf(value: unknown): string {
  const text = JSON.stringify(value);
  const h = new StateHasher();
  h.u32(text.length);
  for (let i = 0; i < text.length; i++) {
    h.u32(text.charCodeAt(i));
  }
  return h.digest();
}

function submit(sim: Sim, s: Scripted, tick?: number): void {
  const res = sim.command(s.player, s.cmd, tick);
  if (!res.ok) {
    throw new Error(`command rejected at tick ${s.tick}: ${res.reason}`);
  }
}

/**
 * Steps a fresh sim `ticks` times and returns every event, then one final `hash` event so the
 * last ticks (when `ticks` is not a multiple of HASH_EVERY) are covered too.
 */
function drive(
  seed: number,
  ticks: number,
  setup: (sim: Sim) => void,
  beforeTick: (sim: Sim, tick: number) => void,
): SimEvent[] {
  const sim = new Sim({ seed, game: defaultGame(), hashEvery: HASH_EVERY });
  setup(sim);
  const events: SimEvent[] = [];
  for (let i = 1; i <= ticks; i++) {
    beforeTick(sim, i);
    events.push(...sim.step());
  }
  if (ticks % HASH_EVERY !== 0) {
    events.push({ tick: sim.tick, kind: 'hash', stateHash: sim.hash() });
  }
  return events;
}

/** Runs `script` on a fresh sim, every command submitted up front with its tick. */
export function runSim(seed: number, script: readonly Scripted[], ticks: number): SimEvent[] {
  return drive(
    seed,
    ticks,
    (sim) => {
      for (const s of script) {
        submit(sim, s, s.tick);
      }
    },
    () => undefined,
  );
}

/** Like `runSim`, but each command is submitted just before its tick runs (default tick), as a live client would. */
export function runSimInterleaved(seed: number, script: readonly Scripted[], ticks: number): SimEvent[] {
  return drive(
    seed,
    ticks,
    () => undefined,
    (sim, tick) => {
      for (const s of script) {
        if (s.tick === tick) {
          submit(sim, s);
        }
      }
    },
  );
}

export function hashesOf(events: readonly SimEvent[]): string[] {
  return events.flatMap((e) => (e.kind === 'hash' ? [e.stateHash] : []));
}

/** `String(x)` (shortest round-trip text), except that negative zero stays "-0". */
function show(x: number): string {
  return Object.is(x, -0) ? '-0' : String(x);
}

const SWEEP_STEPS = 4000;
const TINY_ARGS = [7.45e-9, 7.4e-9, 7.5e-9, 1e-9, 1e-30, 1e-300, 5e-324];
const LARGE_ARGS = [1e6, 1e6 + 0.5, 1.6e6, 1.7e6, 1e7, 1e9, 2 ** 53, 1e15, 1e300];
const AXIS = [
  0,
  -0,
  1,
  -1,
  2.5,
  -2.5,
  1e-300,
  -1e-300,
  1e300,
  -1e300,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

/** Every sin/cos/atan2/hypot input worth stressing: dense sweep, tiny, large, signed zeros, axes. */
function sweepArgs(): number[] {
  const out: number[] = [0, -0, PI, -PI, PI / 2, -PI / 2, PI / 4, 3 * (PI / 2), 2 * PI];
  for (let i = -SWEEP_STEPS; i <= SWEEP_STEPS; i++) {
    out.push((i * 0.0173) / 1.3, i * 0.0731 + 0.5);
  }
  for (const a of [...TINY_ARGS, ...LARGE_ARGS]) {
    out.push(a, -a);
  }
  return out;
}

/** Hash of the exact bits of sin, cos, atan2 and hypot over `sweepArgs()` and the axis/quadrant grid. */
function detmathSweepDigest(): string {
  const h = new StateHasher();
  const args = sweepArgs();
  for (const a of args) {
    h.f64(sin(a)).f64(cos(a));
  }
  for (const y of AXIS) {
    for (const x of AXIS) {
      h.f64(atan2(y, x));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        h.f64(hypot(x, y));
      }
    }
  }
  // Stride-coprime pairing of the dense args, so atan2/hypot see many varied (y, x) quadrants.
  for (let i = 0; i < args.length; i++) {
    const y = args[i] ?? 0;
    const x = args[(i * 7919 + 13) % args.length] ?? 0;
    h.f64(atan2(y, x)).f64(hypot(x / 1e3, y / 1e3));
  }
  return h.digest();
}

function detmathValues(): string[] {
  const out: number[] = [];
  const rng = createRng(SEED);
  for (let i = 0; i < 4; i++) {
    out.push(nextU32(rng), nextFloat(rng), nextInt(rng, 1000));
  }
  out.push(nextU32(deriveRng(SEED, 'bot:3')));
  for (const a of [0.1, 1, 2.5, -3.7, 100.25, 12_345.678]) {
    out.push(sin(a), cos(a));
  }
  for (const [y, x] of [
    [1, 2],
    [-3, 0.5],
    [0.25, -7],
    [-1, -1],
  ] as const) {
    out.push(atan2(y, x), hypot(x, y));
  }
  return out.map(show);
}

export function runScenario(): ScenarioResult {
  const events = runSim(SEED, SCRIPT, TICKS);
  return {
    hashes: hashesOf(events),
    eventDigest: digestOf(events),
    detmath: detmathValues(),
    detmathSweep: detmathSweepDigest(),
  };
}
