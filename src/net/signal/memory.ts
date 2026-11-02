// In-process signalling for tests: peers sharing a hub see each other. Built on the worker's pure
// room machine, so tests exercise the same rules as production. Delivery is synchronous.

import {
  createRoom,
  joinRoom,
  leaveRoom,
  type Outgoing,
  type Room,
  relaySignal,
  type ServerMsg,
} from '../../../worker/room.ts';
import type { PeerId, RoomInfo, Signalling, SignalPayload, Unsubscribe } from '../types.ts';

interface Member {
  readonly deliver: (msg: ServerMsg) => void;
}

interface Hub {
  readonly rooms: Map<string, Room>;
  readonly members: Map<string, Member>;
}

const hubs = new WeakMap<object, Hub>();

function hubOf(key: object): Hub {
  let hub = hubs.get(key);
  if (hub === undefined) {
    hub = { rooms: new Map(), members: new Map() };
    hubs.set(key, hub);
  }
  return hub;
}

/** Peers created with the same `hub` and joining the same room see each other; the first to join is the host. */
export function createMemorySignalling(hubKey: object, id: string): Signalling {
  return new MemorySignalling(hubOf(hubKey), id);
}

class MemorySignalling implements Signalling {
  peers: PeerId[] = [];
  private room = '';
  private joined = false;
  private readonly signalCbs = new Set<(from: PeerId, p: SignalPayload) => void>();
  private readonly presenceCbs = new Set<(peer: PeerId, state: 'join' | 'leave') => void>();

  private readonly hub: Hub;
  private readonly id: string;

  constructor(hub: Hub, id: string) {
    this.hub = hub;
    this.id = id;
  }

  join(room: string): Promise<RoomInfo> {
    if (this.joined) {
      return Promise.reject(new Error('already joined'));
    }
    const state = this.hub.rooms.get(room) ?? createRoom();
    this.hub.rooms.set(room, state);
    const key = `${room}/${this.id}`;
    let info: RoomInfo | undefined;
    this.hub.members.set(key, {
      deliver: (m) => {
        if (m.t === 'joined') {
          info = { self: m.self, host: m.host, peers: m.peers };
        } else {
          this.handle(m);
        }
      },
    });
    const res = joinRoom(state, this.id);
    if (!res.ok) {
      this.hub.members.delete(key);
      return Promise.reject(new Error(res.reason));
    }
    this.room = room;
    this.joined = true;
    this.deliverAll(res.out);
    if (info === undefined) {
      return Promise.reject(new Error('join failed'));
    }
    this.peers = [...info.peers];
    return Promise.resolve(info);
  }

  relay(to: PeerId, payload: SignalPayload): void {
    const state = this.hub.rooms.get(this.room);
    if (this.joined && state !== undefined) {
      this.deliverAll(relaySignal(state, this.id, to, payload));
    }
  }

  onSignal(cb: (from: PeerId, payload: SignalPayload) => void): Unsubscribe {
    this.signalCbs.add(cb);
    return () => this.signalCbs.delete(cb);
  }

  onPresence(cb: (peer: PeerId, state: 'join' | 'leave') => void): Unsubscribe {
    this.presenceCbs.add(cb);
    return () => this.presenceCbs.delete(cb);
  }

  close(): void {
    const state = this.hub.rooms.get(this.room);
    if (this.joined && state !== undefined) {
      this.joined = false;
      const out = leaveRoom(state, this.id);
      this.hub.members.delete(`${this.room}/${this.id}`);
      this.signalCbs.clear();
      this.presenceCbs.clear();
      this.peers = [];
      this.deliverAll(out);
      if (state.peers.length === 0) {
        this.hub.rooms.delete(this.room);
      }
    }
  }

  private deliverAll(out: readonly Outgoing[]): void {
    for (const o of out) {
      this.hub.members.get(`${this.room}/${o.to}`)?.deliver(o.msg);
    }
  }

  private handle(m: ServerMsg): void {
    if (m.t === 'signal') {
      for (const cb of [...this.signalCbs]) {
        cb(m.from, m.payload);
      }
    } else if (m.t === 'presence') {
      this.peers = m.state === 'join' ? [...this.peers, m.peer] : this.peers.filter((p) => p !== m.peer);
      for (const cb of [...this.presenceCbs]) {
        cb(m.peer, m.state);
      }
    }
  }
}
