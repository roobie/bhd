// Pure room state machine for signalling (wave 10 slice A). No sockets, clocks or randomness:
// every operation returns the outgoing messages as data, the Durable Object adapter delivers them.

import type { IceServer, SignalPayload } from '../src/net/types.ts';

/** Most peers one room holds. */
export const MAX_ROOM_PEERS = 5;

const CODE_LENGTH = 4;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const KINDS: readonly string[] = ['offer', 'answer', 'ice'];
const MAX_SIGNAL_DATA = 16_384;

/** Server to client. */
export type ServerMsg =
  | {
      readonly t: 'joined';
      readonly self: string;
      readonly host: string;
      readonly peers: readonly string[];
      /** STUN / TURN servers for WebRTC. Only members of a room get them (there is no public `/turn`). */
      readonly iceServers?: readonly IceServer[];
    }
  | { readonly t: 'signal'; readonly from: string; readonly payload: SignalPayload }
  | { readonly t: 'presence'; readonly peer: string; readonly state: 'join' | 'leave' }
  /** The host left: the room is over and takes no new joins. */
  | { readonly t: 'host-left'; readonly host: string }
  | { readonly t: 'error'; readonly reason: string };

/** Client to server. */
export interface ClientMsg {
  readonly t: 'relay';
  readonly to: string;
  readonly payload: SignalPayload;
}

export interface Outgoing {
  readonly to: string;
  readonly msg: ServerMsg;
}

export interface Room {
  host: string | undefined;
  closed: boolean;
  readonly peers: string[];
}

export type JoinResult =
  | { readonly ok: true; readonly out: readonly Outgoing[] }
  | { readonly ok: false; readonly reason: string };

export function createRoom(): Room {
  return { host: undefined, closed: false, peers: [] };
}

/** A 4-letter room code from `rand` in [0, 1). */
export function roomCode(rand: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET.charAt(Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length);
  }
  return code;
}

/** Whether `code` is a well formed 4-letter room code. */
export function isRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** Adds `peer`. The first peer to join is the host. Others are told of the join. */
export function joinRoom(room: Room, peer: string): JoinResult {
  if (room.closed) {
    return { ok: false, reason: 'room closed' };
  }
  if (room.peers.includes(peer)) {
    return { ok: false, reason: 'already joined' };
  }
  if (room.peers.length >= MAX_ROOM_PEERS) {
    return { ok: false, reason: 'room full' };
  }
  const others = [...room.peers];
  room.peers.push(peer);
  room.host ??= peer;
  const out: Outgoing[] = [{ to: peer, msg: { t: 'joined', self: peer, host: room.host, peers: others } }];
  for (const other of others) {
    out.push({ to: other, msg: { t: 'presence', peer, state: 'join' } });
  }
  return { ok: true, out };
}

/** Removes `peer`. Others get a leave; if it was the host they also get `host-left` and the room closes. */
export function leaveRoom(room: Room, peer: string): readonly Outgoing[] {
  const at = room.peers.indexOf(peer);
  if (at < 0) {
    return [];
  }
  room.peers.splice(at, 1);
  const out: Outgoing[] = [];
  for (const other of room.peers) {
    out.push({ to: other, msg: { t: 'presence', peer, state: 'leave' } });
  }
  if (room.host === peer) {
    room.closed = true;
    for (const other of room.peers) {
      out.push({ to: other, msg: { t: 'host-left', host: peer } });
    }
  }
  return out;
}

/** Relays a signal from `from` to `to`; an unknown `to` is answered with an error to the sender. */
export function relaySignal(room: Room, from: string, to: string, payload: SignalPayload): readonly Outgoing[] {
  if (!room.peers.includes(from)) {
    return [];
  }
  if (to === from || !room.peers.includes(to)) {
    return [{ to: from, msg: { t: 'error', reason: 'no such peer' } }];
  }
  return [{ to, msg: { t: 'signal', from, payload } }];
}

/** `out` with `iceServers` added to every `joined` message in it. */
export function withIceServers(out: readonly Outgoing[], iceServers: readonly IceServer[]): readonly Outgoing[] {
  return out.map((o) => (o.msg.t === 'joined' ? { to: o.to, msg: { ...o.msg, iceServers } } : o));
}

/** Sends every message in `out`; a socket that throws is skipped and does not stop the rest (L3). Returns the receivers that failed. */
export function deliverAll(out: readonly Outgoing[], send: (to: string, text: string) => void): string[] {
  const failed: string[] = [];
  for (const o of out) {
    try {
      send(o.to, JSON.stringify(o.msg));
    } catch {
      failed.push(o.to);
    }
  }
  return failed;
}

/**
 * Whether a request from `origin` may use the worker. `allowed` is the `ALLOWED_ORIGINS` env value, a
 * comma separated list of origins; unset (or empty, or `*`) allows every origin. A listed origin must
 * match exactly; a request without an Origin header (not a browser page) is refused when a list is set.
 */
export function originAllowed(allowed: string | undefined, origin: string | null): boolean {
  const list = (allowed ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (list.length === 0 || list.includes('*')) {
    return true;
  }
  return origin !== null && list.includes(origin);
}

/** Validates a parsed client message; never throws. */
export function parseClientMsg(raw: unknown): ClientMsg | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  const p = r.payload as Record<string, unknown> | null | undefined;
  if (
    r.t !== 'relay' ||
    typeof r.to !== 'string' ||
    typeof p !== 'object' ||
    p === null ||
    typeof p.kind !== 'string' ||
    !KINDS.includes(p.kind) ||
    typeof p.data !== 'string' ||
    p.data.length > MAX_SIGNAL_DATA
  ) {
    return undefined;
  }
  return { t: 'relay', to: r.to, payload: { kind: p.kind as SignalPayload['kind'], data: p.data } };
}
