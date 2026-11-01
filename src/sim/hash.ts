// State hash for desync detection. Two MurmurHash3-style 32-bit lanes with different seeds,
// cross-mixed at the end into 64 bits. Not cryptographic: a real desync slips past one check with
// probability ~2^-64 for ideal mixing and no worse than ~2^-32, and a desync persists across
// later checks, so it is caught within a check or two. Floats are hashed by their exact IEEE bits
// (little-endian, so the result is platform independent; -0 and 0 differ).

import type { Rng } from '../detmath/index.ts';
import type { IntentBoard } from '../intents/board.ts';
import { boardUsed, hashIntents } from '../intents/board.ts';
import type { EntityStore } from './entities.ts';
import { ENTITY_KIND_CODE, MOVE_MODE_CODE } from './entities.ts';
import { hashKit } from './heroes/index.ts';
import type { MasterState } from './master.ts';
import { hashMaster } from './master.ts';
import type { WaveState } from './waves.ts';
import { hashWaves } from './waves.ts';

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

  /** Length, then every UTF-16 code unit. Content ids are hashed as text, so there is no code table to keep in step. */
  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) {
      this.u32(s.charCodeAt(i));
    }
    return this;
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

/** Everything `stateHash` reads. */
interface HashedState {
  readonly tick: number;
  readonly ended: boolean;
  readonly entities: EntityStore;
  readonly waves: WaveState;
  readonly rng: Rng;
  readonly intents: IntentBoard;
  readonly master: MasterState | undefined;
}

/**
 * Canonical hash of game state, in a fixed order: tick, ended flag, entity store (next ID, count,
 * then each entity in ID order: id, kind, def, team, x, y, radius, hp, maxHp, armour, speed,
 * statuses, move, attack, kit, prop), wave scheduler, sim RNG state, then the intents board (a presence byte,
 * then the board once used) and the wave master state (a presence byte, then the state). Floats by exact bits (also tick counts that could turn fractional, e.g. cooldowns and `until`); kinds and
 * move modes through append-only code tables; content ids (def, status) as text. Pending commands
 * are excluded on purpose: in lockstep, future inputs arrive at different times on different peers
 * without being a desync.
 */
export function stateHash(s: HashedState): string {
  const h = new StateHasher();
  h.u32(s.tick).bool(s.ended).u32(s.entities.nextId).u32(s.entities.size);
  for (const e of s.entities.values()) {
    h.u32(e.id).u32(ENTITY_KIND_CODE[e.kind]).str(e.def).u32(e.team);
    h.f64(e.x).f64(e.y).f64(e.radius).f64(e.hp).f64(e.maxHp).f64(e.armour).f64(e.speed);
    h.u32(e.statuses.length);
    for (const st of e.statuses) {
      h.str(st.status).f64(st.until).u32(st.src).f64(st.value);
    }
    h.u32(MOVE_MODE_CODE[e.move.mode]).f64(e.move.tx).f64(e.move.ty).u32(e.move.waypoint);
    h.f64(e.attack.cooldown).u32(e.attack.target);
    h.bool(e.kit !== undefined);
    if (e.kit !== undefined) {
      hashKit(h, e.kit);
    }
    h.bool(e.prop !== undefined);
    if (e.prop !== undefined) {
      h.u32(e.prop.owner).f64(e.prop.until).f64(e.prop.ux).f64(e.prop.uy).f64(e.prop.halfLength);
    }
  }
  hashWaves(h, s.waves);
  for (const w of s.rng.state) {
    h.u32(w);
  }
  // Each optional section is tagged present/absent, so a section can never be mistaken for the
  // bytes of the next one (or for a missing one).
  const board = boardUsed(s.intents);
  h.bool(board);
  if (board) {
    hashIntents(h, s.intents);
  }
  h.bool(s.master !== undefined);
  if (s.master !== undefined) {
    hashMaster(h, s.master);
  }
  return h.digest();
}
