// play.html URL-hash configuration. Owner: w7-shell.
// Reuses the pure parsers `parseSeed` and `parseMode` of ../config.ts (the viewer's); the shell
// imports nothing else from the viewer.

import { defaultBotSetup } from '../../content/bots.ts';
import type { GameSpec } from '../../match/run.ts';
import { DEFAULT_HASH_EVERY, DEFAULT_MAX_TICKS, RUN_ABI } from '../../match/run.ts';
import { parseMode, parseSeed } from '../config.ts';
import type { ShellConfig } from './types.ts';

const HASH_PREFIX = /^#/u;
const SLOTS = 4;
const DIGIT = /^\d$/u;
const REACTION_SECONDS = 0.4;
const THINK_SECONDS = 0.5;

export function defaultShellConfig(): ShellConfig {
  return { seed: 1, mode: 'director', drive: [0] };
}

/** A comma list of slots 0-3 (deduplicated, ascending); empty text is the empty list; else undefined. */
function parseDrive(text: string): readonly number[] | undefined {
  if (text.trim() === '') {
    return [];
  }
  const slots = new Set<number>();
  for (const part of text.split(',')) {
    const t = part.trim();
    const n = DIGIT.test(t) ? Number(t) : -1;
    if (n < 0 || n >= SLOTS) {
      return undefined;
    }
    slots.add(n);
  }
  return [...slots].sort((a, b) => a - b);
}

/**
 * `#seed=1&mode=director&drive=0,3` -> ShellConfig. Invalid or missing fields fall back to the
 * defaults and it never throws. `drive`: comma list of slots 0-3 (deduplicated, ascending); an
 * explicitly empty `drive=` means watch (all bots); an absent `drive` means the default `[0]`.
 */
export function parseShellHash(hash: string): ShellConfig {
  const base = defaultShellConfig();
  const params = new URLSearchParams(hash.replace(HASH_PREFIX, ''));
  const seed = parseSeed(params.get('seed') ?? '');
  const mode = parseMode(params.get('mode') ?? '');
  const drive = params.has('drive') ? parseDrive(params.get('drive') ?? '') : undefined;
  return { seed: seed ?? base.seed, mode: mode ?? base.mode, drive: drive ?? base.drive };
}

/** The hash for a config (no leading '#'). `parseShellHash(serialiseShellHash(c))` equals `c`. */
export function serialiseShellHash(c: ShellConfig): string {
  const params = new URLSearchParams();
  params.set('seed', String(c.seed));
  params.set('mode', c.mode);
  params.set('drive', c.drive.join(','));
  return params.toString().replaceAll('%2C', ',');
}

const ROOM_RE = /^[A-Za-z0-9_-]{1,32}$/u;
const LOCAL_ROOM = /^local-/iu;
const MAX_NAME = 32;
const CONTROL = /\p{Cc}/gu;

/** Multiplayer parameters of the URL: `#room=ABCD&name=Ada`. No `room` means solo. */
export interface RoomConfig {
  readonly room: string | undefined;
  readonly name: string;
}

/** Room codes are upper case; `local-*` rooms (BroadcastChannel testing) are lower case. */
function normaliseRoom(text: string): string | undefined {
  const t = text.trim();
  if (!ROOM_RE.test(t)) {
    return undefined;
  }
  return LOCAL_ROOM.test(t) ? t.toLowerCase() : t.toUpperCase();
}

/** `#room=ABCD&name=Ada` (or the same in a `?query`) -> RoomConfig. Never throws. */
export function parseRoomConfig(hash: string, search = ''): RoomConfig {
  const params = new URLSearchParams(hash.replace(HASH_PREFIX, ''));
  const query = new URLSearchParams(search);
  const get = (k: string): string => params.get(k) ?? query.get(k) ?? '';
  const name = get('name').replace(CONTROL, '').trim().slice(0, MAX_NAME);
  return { room: normaliseRoom(get('room')), name: name === '' ? 'Player' : name };
}

/** The GameSpec a shell config plays: the run defaults, every doctrine of the shipped bots, `humans` = `drive`. */
export function shellSpec(c: ShellConfig): GameSpec {
  return {
    abi: RUN_ABI,
    seed: c.seed,
    mode: c.mode,
    doctrines: [0, 1, 2, 3].map(
      (slot) => defaultBotSetup().seats.find((s) => s.slot === slot)?.doctrine ?? 'hold-the-line',
    ),
    reactionSeconds: REACTION_SECONDS,
    thinkSeconds: THINK_SECONDS,
    maxTicks: DEFAULT_MAX_TICKS,
    hashEvery: DEFAULT_HASH_EVERY,
    humans: c.drive,
  };
}
