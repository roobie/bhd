// Serverless signalling for local play: tabs of one browser meet over a BroadcastChannel named for
// the room (`local-*` rooms). Each tab picks a random id; the host is the first tab present.
//
// Protocol: a joiner posts `who`; every present tab answers `here` (with who is host). A joiner that
// hears nothing within `settleMs` is the host. `bye` announces leaving; `sig` carries a relay.

import type { PeerId, RoomInfo, Signalling, SignalPayload, Unsubscribe } from '../types.ts';

const MAX_PEERS = 5;

type Msg =
  | { readonly t: 'who'; readonly id: string }
  | { readonly t: 'here'; readonly id: string; readonly to: string; readonly host: string }
  | { readonly t: 'bye'; readonly id: string }
  | { readonly t: 'sig'; readonly id: string; readonly to: string; readonly payload: SignalPayload };

export interface BroadcastOptions {
  /** This tab's peer id; default random. */
  readonly id?: string;
  /** How long a joiner listens for existing tabs. */
  readonly settleMs?: number;
}

/** Whether `room` is a serverless local room. */
export function isLocalRoom(room: string): boolean {
  return room.startsWith('local-');
}

export function createBroadcastSignalling(opts: BroadcastOptions = {}): Signalling {
  const id = opts.id ?? crypto.randomUUID().slice(0, 8);
  const settleMs = opts.settleMs ?? 150;
  const signalCbs = new Set<(from: PeerId, p: SignalPayload) => void>();
  const presenceCbs = new Set<(peer: PeerId, state: 'join' | 'leave') => void>();
  let peers: PeerId[] = [];
  let host = id;
  let chan: BroadcastChannel | undefined;
  let live = false;

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
      post({ t: 'here', id, to: m.id, host });
      addPeer(m.id);
    } else if (m.t === 'bye') {
      dropPeer(m.id);
    } else if (m.t === 'sig' && m.to === id) {
      for (const cb of [...signalCbs]) {
        cb(m.id, m.payload);
      }
    }
  };

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
      const found: PeerId[] = [];
      let hostSeen: string | undefined;
      return new Promise<RoomInfo>((resolve, reject) => {
        c.onmessage = (ev: MessageEvent) => {
          const m = ev.data as Msg;
          if (!live && m.t === 'here' && m.to === id) {
            found.push(m.id);
            hostSeen = m.host;
          } else if (live) {
            onLive(m);
          }
        };
        post({ t: 'who', id });
        setTimeout(() => {
          if (chan !== c) {
            reject(new Error('closed'));
          } else if (found.length >= MAX_PEERS) {
            c.close();
            chan = undefined;
            reject(new Error('room full'));
          } else {
            live = true;
            host = hostSeen ?? id;
            peers = found;
            resolve({ self: id, host, peers: [...found] });
          }
        }, settleMs);
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
      signalCbs.clear();
      presenceCbs.clear();
      peers = [];
      chan?.close();
    },
  };
}
