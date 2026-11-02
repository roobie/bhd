// Serverless signalling for local play: tabs of one browser meet over a BroadcastChannel named for
// the room (`local-*` rooms). Each tab picks a random id.
//
// Who is host (M5): where the Web Locks API exists, the tab that gets the lock `bhd-host:<room>` with
// `ifAvailable` is the host and holds it until it closes, so two tabs opened in the same instant cannot
// both win. Elsewhere (Node tests) the first tab present is the host: a joiner that hears nothing within
// `settleMs` takes the role.
//
// Protocol: a joiner posts `who`; every live tab answers `here` (with who is host, '' when nobody is).
// `bye` announces leaving, and a departed host is no longer advertised, so a late tab never joins a dead
// host: with locks it finds the lock free and hosts a fresh room, without them it sees no host and does the same.
// `sig` carries a relay.

import type { PeerId, RoomInfo, Signalling, SignalPayload, Unsubscribe } from '../types.ts';

const MAX_PEERS = 5;
/** How many settle rounds a tab that lost the lock waits for the winner to answer, before giving up. */
const LOCK_ROUNDS = 6;

type Msg =
  | { readonly t: 'who'; readonly id: string }
  | { readonly t: 'here'; readonly id: string; readonly to: string; readonly host: string }
  | { readonly t: 'bye'; readonly id: string }
  | { readonly t: 'sig'; readonly id: string; readonly to: string; readonly payload: SignalPayload };

/** The slice of `navigator.locks` used here. */
export interface LockManagerLike {
  request: (
    name: string,
    options: { readonly ifAvailable: boolean },
    callback: (lock: unknown) => Promise<unknown> | undefined,
  ) => Promise<unknown>;
}

export interface BroadcastOptions {
  /** This tab's peer id; default random. */
  readonly id?: string;
  /** How long a joiner listens for existing tabs. */
  readonly settleMs?: number;
  /** Host election lock manager; default `navigator.locks`. `null` turns locks off (first-present wins). */
  readonly locks?: LockManagerLike | null;
}

/** Whether `room` is a serverless local room. */
export function isLocalRoom(room: string): boolean {
  return room.startsWith('local-');
}

function defaultLocks(): LockManagerLike | undefined {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return typeof nav?.locks?.request === 'function' ? nav.locks : undefined;
}

/** One join in progress: what the settle rounds have heard so far. */
interface Joining {
  readonly c: BroadcastChannel;
  readonly room: string;
  readonly found: PeerId[];
  hostSeen: string | undefined;
  readonly resolve: (info: RoomInfo) => void;
  readonly reject: (e: Error) => void;
}

/** Runs a promise to completion; `decide` handles its own errors. */
function fire(p: Promise<void>): void {
  p.catch(() => undefined);
}

/**
 * Who hosts, once the settle window is over. `won`: true = this tab took the host lock, false = another
 * tab holds it, undefined = no usable locks (the first tab present hosts). Returns the host, or
 * 'retry' (a lock holder exists but has not answered yet) or 'fail' (it never did: it is gone).
 */
function electHost(a: {
  readonly won: boolean | undefined;
  readonly hostSeen: string | undefined;
  readonly self: string;
  readonly round: number;
}): { readonly host: string } | 'retry' | 'fail' {
  if (a.won === true) {
    return { host: a.self };
  }
  if (a.won === undefined) {
    return { host: a.hostSeen ?? a.self };
  }
  if (a.hostSeen !== undefined) {
    return { host: a.hostSeen };
  }
  return a.round < LOCK_ROUNDS ? 'retry' : 'fail';
}

export function createBroadcastSignalling(opts: BroadcastOptions = {}): Signalling {
  const id = opts.id ?? crypto.randomUUID().slice(0, 8);
  const settleMs = opts.settleMs ?? 150;
  const locks = opts.locks === null ? undefined : (opts.locks ?? defaultLocks());
  const signalCbs = new Set<(from: PeerId, p: SignalPayload) => void>();
  const presenceCbs = new Set<(peer: PeerId, state: 'join' | 'leave') => void>();
  let peers: PeerId[] = [];
  /** The host as far as this tab knows; undefined once it said `bye`. */
  let host: PeerId | undefined = id;
  let chan: BroadcastChannel | undefined;
  let live = false;
  let releaseLock: (() => void) | undefined;

  const post = (m: Msg): void => chan?.postMessage(m);
  const addPeer = (peer: PeerId): void => {
    if (peer !== id && !peers.includes(peer)) {
      peers = [...peers, peer];
      for (const cb of [...presenceCbs]) {
        cb(peer, 'join');
      }
    }
  };
  const dropPeer = (peer: PeerId): void => {
    if (peers.includes(peer)) {
      peers = peers.filter((p) => p !== peer);
      for (const cb of [...presenceCbs]) {
        cb(peer, 'leave');
      }
    }
  };

  const onLive = (m: Msg): void => {
    if (m.t === 'who' && m.id !== id) {
      post({ t: 'here', id, to: m.id, host: host ?? '' });
      addPeer(m.id);
    } else if (m.t === 'bye') {
      if (m.id === host) {
        host = undefined; // stop advertising a host that is gone
      }
      dropPeer(m.id);
    } else if (m.t === 'sig' && m.to === id) {
      for (const cb of [...signalCbs]) {
        cb(m.id, m.payload);
      }
    }
  };

  /** Tries for the host lock: true = won (held until `close`), false = another tab holds it, undefined = unusable. */
  function takeLock(room: string): Promise<boolean | undefined> {
    if (locks === undefined) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      locks
        .request(`bhd-host:${room}`, { ifAvailable: true }, (lock) => {
          if (lock === null || lock === undefined) {
            resolve(false);
            return;
          }
          resolve(true);
          return new Promise<void>((release) => {
            releaseLock = release;
          });
        })
        .catch(() => resolve(undefined));
    });
  }

  /** Before going live, only answers to our `who` count; after, the live protocol. */
  function onMessage(j: Joining, m: Msg): void {
    if (live) {
      onLive(m);
    } else if (m.t === 'here' && m.to === id) {
      if (!j.found.includes(m.id)) {
        j.found.push(m.id);
      }
      j.hostSeen = m.host === '' ? j.hostSeen : m.host;
    }
  }

  function finish(j: Joining, hostId: string): void {
    live = true;
    host = hostId;
    peers = j.found;
    j.resolve({ self: id, host: hostId, peers: [...j.found] });
  }

  function giveUp(j: Joining, reason: string): void {
    j.c.close();
    chan = undefined;
    j.reject(new Error(reason));
  }

  /** The end of a settle round: check the room and the host lock, then become host, join one, ask again or give up. */
  async function decide(j: Joining, round: number): Promise<void> {
    if (chan !== j.c) {
      j.reject(new Error('closed'));
      return;
    }
    if (j.found.length >= MAX_PEERS) {
      giveUp(j, 'room full');
      return;
    }
    const won = await takeLock(j.room);
    if (chan !== j.c) {
      releaseLock?.();
      j.reject(new Error('closed'));
      return;
    }
    const verdict = electHost({ won, hostSeen: j.hostSeen, self: id, round });
    if (verdict === 'retry') {
      // Someone holds the lock but has not answered yet (it is still settling): ask again.
      post({ t: 'who', id });
      setTimeout(() => fire(decide(j, round + 1)), settleMs);
    } else if (verdict === 'fail') {
      giveUp(j, 'host-left');
    } else {
      finish(j, verdict.host);
    }
  }

  return {
    get peers() {
      return peers;
    },
    join(room: string): Promise<RoomInfo> {
      if (chan !== undefined) {
        return Promise.reject(new Error('already joined'));
      }
      if (!isLocalRoom(room)) {
        return Promise.reject(new Error('broadcast signalling serves local-* rooms only'));
      }
      const c = new BroadcastChannel(`bhd-signal:${room}`);
      chan = c;
      return new Promise<RoomInfo>((resolve, reject) => {
        const j: Joining = { c, room, found: [], hostSeen: undefined, resolve, reject };
        c.onmessage = (ev: MessageEvent) => onMessage(j, ev.data as Msg);
        post({ t: 'who', id });
        setTimeout(() => fire(decide(j, 1)), settleMs);
      });
    },
    relay(to, payload) {
      if (live) {
        post({ t: 'sig', id, to, payload });
      }
    },
    onSignal(cb): Unsubscribe {
      signalCbs.add(cb);
      return () => signalCbs.delete(cb);
    },
    onPresence(cb): Unsubscribe {
      presenceCbs.add(cb);
      return () => presenceCbs.delete(cb);
    },
    close() {
      if (live) {
        post({ t: 'bye', id });
      }
      live = false;
      releaseLock?.();
      releaseLock = undefined;
      signalCbs.clear();
      presenceCbs.clear();
      peers = [];
      chan?.close();
      chan = undefined;
    },
  };
}
