// State hash for desync detection. Two MurmurHash3-style 32-bit lanes with different seeds,
// cross-mixed at the end into 64 bits. Not cryptographic: a real desync slips past one check with
// probability ~2^-64 for ideal mixing and no worse than ~2^-32, and a desync persists across
// later checks, so it is caught within a check or two. Floats are hashed by their exact IEEE bits
// (little-endian, so the result is platform independent; -0 and 0 differ).

const C1 = 0xcc_9e_2d_51;
const C2 = 0x1b_87_35_93;

function rotl(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

function mixWord(h: number, w: number): number {
  const k = Math.imul(rotl(Math.imul(w, C1), 15), C2);
  return (Math.imul(rotl(h ^ k, 13), 5) + 0xe6_54_6b_64) | 0;
}

function fmix(x: number): number {
  let h = x;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85_eb_ca_6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2_b2_ae_35);
  return h ^ (h >>> 16);
}

function hex(x: number): string {
  return (x >>> 0).toString(16).padStart(8, '0');
}

export class StateHasher {
  #h1 = 0x25_45_f4_91;
  #h2 = 0x6a_09_e6_67;
  #words = 0;
  readonly #view = new DataView(new ArrayBuffer(8));

  u32(w: number): this {
    this.#h1 = mixWord(this.#h1, w);
    this.#h2 = mixWord(this.#h2, w ^ 0x9e_37_79_b9);
    this.#words += 1;
    return this;
  }

  f64(x: number): this {
    this.#view.setFloat64(0, x, true);
    return this.u32(this.#view.getUint32(0, true)).u32(this.#view.getUint32(4, true));
  }

  bool(b: boolean): this {
    return this.u32(b ? 1 : 0);
  }

  /** 16 hex chars. */
  digest(): string {
    let h1 = this.#h1 ^ this.#words;
    let h2 = this.#h2 ^ this.#words;
    h1 = (h1 + h2) | 0;
    h2 = (h2 + h1) | 0;
    h1 = fmix(h1);
    h2 = fmix(h2);
    h1 = (h1 + h2) | 0;
    h2 = (h2 + h1) | 0;
    return hex(h1) + hex(h2);
  }
}
