// Deterministic math and seeded RNG for lockstep (DESIGN.md §6.1).
// Built only from IEEE-exact operations (+ - * /, Math.sqrt, Math.imul, Math.abs/floor, bitwise),
// so every engine produces bit-identical results. Math.sin/cos/atan2/hypot/random are banned here.

// ---------------------------------------------------------------- RNG

/** sfc32 state: [a, b, c, counter]. Mutated in place; plain data so the sim can hash it. */
export interface Rng {
  readonly state: Uint32Array;
}

const GOLDEN = 0x9e_37_79_b9;

/** splitmix32-style finalizer: a bijective avalanche mix of a uint32. */
function mix32(x: number): number {
  let z = x >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21_f0_aa_ad);
  z = Math.imul(z ^ (z >>> 15), 0x73_5a_2d_97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** FNV-1a over UTF-16 code units, then mixed. Integer ops only. */
function hashString(s: string): number {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01_00_01_93);
  }
  return mix32(h);
}

function seeded(key: number): Rng {
  const state = new Uint32Array(4);
  let s = key >>> 0;
  for (let i = 0; i < 3; i++) {
    s = (s + GOLDEN) >>> 0;
    state[i] = mix32(s);
  }
  state[3] = 1;
  const rng: Rng = { state };
  // Standard sfc32 warm-up so nearby seeds decorrelate.
  for (let i = 0; i < 12; i++) {
    nextU32(rng);
  }
  return rng;
}

/** Base generator for a game seed (any uint32; other numbers are truncated mod 2^32). */
export function createRng(seed: number): Rng {
  return seeded(seed);
}

/** Independent named stream (e.g. 'director', 'bot:2') derived from the game seed. Never equals the base stream's seeding. */
export function deriveRng(seed: number, stream: string): Rng {
  return seeded(mix32((seed >>> 0) ^ GOLDEN) ^ hashString(stream));
}

export function cloneRng(rng: Rng): Rng {
  return { state: rng.state.slice() };
}

/** sfc32 step: uniform uint32 in [0, 2^32). Period ≥ 2^32 thanks to the counter word. */
export function nextU32(rng: Rng): number {
  const st = rng.state;
  const a = st[0]!;
  const b = st[1]!;
  const c = st[2]!;
  const d = st[3]!;
  const t = (((a + b) | 0) + d) | 0;
  st[3] = d + 1;
  st[0] = b ^ (b >>> 9);
  st[1] = b + (b << 3);
  st[2] = ((c << 21) | (c >>> 11)) + t;
  return t >>> 0;
}

/** Uniform in [0, 1) with 32 bits of resolution (division by 2^32 is exact). */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 4_294_967_296;
}

/** Unbiased uniform integer in [0, n) by rejection; n must be an integer in [1, 2^32]. */
export function nextInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 4_294_967_296) {
    throw new RangeError(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = 4_294_967_296 - (4_294_967_296 % n);
  for (;;) {
    const x = nextU32(rng);
    if (x < limit) {
      return x % n;
    }
  }
}

// ---------------------------------------------------------------- Trig
// sin/cos: Cody–Waite reduction by π/2 with a 3-part constant (exact for |a| < 2^20·π/2 ≈ 1.6e6),
// then fdlibm's minimax kernels on [-π/4, π/4]. Max abs error ≤ 2^-51 (4.4e-16) for |a| ≤ 1e6;
// beyond that, reduction error grows with |a| but results stay deterministic and in [-1, 1].
// atan2: fdlibm's atan (table breakpoints + 11-term polynomial), < 1 ulp; max abs error ≤ 2^-50 (8.9e-16).

export const { PI } = Math;
export const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const TWO_OVER_PI = 0.636_619_772_367_581_4;
// π/2 split so k·PIO2_1 and k·PIO2_2 are exact for |k| < 2^20.
const PIO2_1 = 1.570_796_326_734_125_6;
const PIO2_2 = 6.077_100_506_303_966e-11;
const PIO2_3 = 2.022_266_248_711_166_5e-21;

const S1 = -0.166_666_666_666_666_32;
const S2 = 0.008_333_333_333_322_49;
const S3 = -0.000_198_412_698_298_579_5;
const S4 = 2.755_731_370_707_006_8e-6;
const S5 = -2.505_076_025_340_686_3e-8;
const S6 = 1.589_690_995_211_55e-10;

const C1 = 0.041_666_666_666_666_6;
const C2 = -0.001_388_888_888_887_411;
const C3 = 2.480_158_728_947_673e-5;
const C4 = -2.755_731_435_139_066_3e-7;
const C5 = 2.087_572_321_298_175e-9;
const C6 = -1.135_964_755_778_819_5e-11;

function kernelSin(r: number): number {
  if (Math.abs(r) < 7.450_580_596_923_828e-9) {
    return r; // 2^-27: sin r = r to double precision; also keeps -0.
  }
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function kernelCos(r: number): number {
  const z = r * r;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** Kernel for r ∈ [-π/4, π/4] rotated by q quarter turns: sin(r + q·π/2). */
function quadrant(r: number, q: number): number {
  switch (q) {
    case 0:
      return kernelSin(r);
    case 1:
      return kernelCos(r);
    case 2:
      return -kernelSin(r);
    default:
      return -kernelCos(r);
  }
}

/** Slightly above π/4: kernels stay accurate here, so the reduction loop always terminates. */
const REDUCED = 0.786;

/**
 * sin(a + shift·π/2): reduce a = r + k·π/2 with r ∈ [-π/4, π/4], then pick the quadrant.
 * One pass is exact for |a| < 1.6e6; larger inputs need extra passes (deterministic, low accuracy).
 */
function sinShifted(a: number, shift: number): number {
  let r = a;
  let q = shift;
  while (Math.abs(r) > REDUCED) {
    const k = Math.floor(r * TWO_OVER_PI + 0.5);
    r = r - k * PIO2_1 - k * PIO2_2 - k * PIO2_3;
    q += k % 4;
  }
  return quadrant(r, ((q % 4) + 4) % 4);
}

export function sin(a: number): number {
  return sinShifted(a, 0);
}

export function cos(a: number): number {
  return sinShifted(a, 1);
}

const ATAN_HI = [0.463_647_609_000_806_1, 0.785_398_163_397_448_3, 0.982_793_723_247_329, HALF_PI];
const ATAN_LO = [
  2.269_877_745_296_168_7e-17, 3.061_616_997_868_383e-17, 1.390_331_103_123_099_8e-17, 6.123_233_995_736_766e-17,
];
const AT0 = 0.333_333_333_333_329_3;
const AT1 = -0.199_999_999_998_764_83;
const AT2 = 0.142_857_142_725_034_66;
const AT3 = -0.111_111_104_054_623_56;
const AT4 = 0.090_908_871_334_365_07;
const AT5 = -0.076_918_762_050_448_3;
const AT6 = 0.066_610_731_373_875_31;
const AT7 = -0.058_335_701_337_905_735;
const AT8 = 0.049_768_779_946_159_324;
const AT9 = -0.036_531_572_744_216_916;
const AT10 = 0.016_285_820_115_365_782;

/** atan for x ≥ 0 (fdlibm s_atan.c). */
function atanPos(x: number): number {
  if (x >= 7.378_697_629_483_821e19) {
    return HALF_PI; // 2^66: atan is π/2 to double precision.
  }
  let t = x;
  let id: number;
  if (x < 0.4375) {
    if (x < 7.450_580_596_923_828e-9) {
      return x; // 2^-27
    }
    id = -1;
  } else if (x < 0.6875) {
    id = 0;
    t = (2 * x - 1) / (2 + x);
  } else if (x < 1.1875) {
    id = 1;
    t = (x - 1) / (x + 1);
  } else if (x < 2.4375) {
    id = 2;
    t = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3;
    t = -1 / x;
  }
  const z = t * t;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) {
    return t - t * (s1 + s2);
  }
  return ATAN_HI[id]! - (t * (s1 + s2) - ATAN_LO[id]! - t);
}

const PI_LO = 1.224_646_799_147_353_2e-16;

/** atan2 magnitude for |y| = ay, |x| = ax, with x's sign given separately (it matters for x = -0). */
function atan2Abs(ay: number, ax: number, xNeg: boolean): number {
  if (ay === 0) {
    return xNeg ? PI : 0;
  }
  if (ax === Number.POSITIVE_INFINITY) {
    if (ay === Number.POSITIVE_INFINITY) {
      return xNeg ? 3 * (PI / 4) : PI / 4;
    }
    return xNeg ? PI : 0;
  }
  if (ax === 0 || ay === Number.POSITIVE_INFINITY) {
    return HALF_PI;
  }
  const z = atanPos(ay / ax);
  return xNeg ? PI - (z - PI_LO) : z;
}

/** Same contract as Math.atan2, including signed zeros and infinities. Result in [-π, π]. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return Number.NaN;
  }
  const yNeg = y < 0 || (y === 0 && 1 / y < 0);
  const xNeg = x < 0 || (x === 0 && 1 / x < 0);
  const z = atan2Abs(Math.abs(y), Math.abs(x), xNeg);
  return yNeg ? -z : z;
}

/** √(x²+y²) via Math.sqrt (IEEE-exact). No overflow scaling: game coordinates are small. */
export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Wraps an angle into [-π, π). */
export function wrapAngle(a: number): number {
  return a - TAU * Math.floor((a + PI) / TAU);
}

/** Shortest signed turn from `from` to `to`, in [-π, π). */
export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from);
}
