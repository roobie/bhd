// The loopback hub: `Transport` ports for N peers with seeded latency and jitter, reliable and ordered
// per link (so reordering happens only across peers), driven by a virtual clock. Messages go through
// encodeMsg / decodeMsg, so the wire format is exercised too.

import type { PeerId, PeerState, Transport, Unsubscribe, WireMsg } from '../../src/net/types.ts';
import { decodeMsg, encodeMsg } from '../../src/net/types.ts';

export interface Latency {
  /** Milliseconds, one way. */
  readonly min: number;
  readonly max: number;
}

/** Small seeded generator (mulberry32); the tests only need repeatable, well mixed numbers. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Event {
  readonly at: number;
  readonly seq: number;
  readonly run: () => void;
}

/** A peer's end of the hub. */
export interface Port extends Transport {
  readonly messages: Set<(from: PeerId, msg: WireMsg) => void>;
  readonly peers: Set<(peer: PeerId, state: PeerState) => void>;
  readonly bad: Set<(from: PeerId, reason: string) => void>;
  closed: boolean;
  /** Delivered messages that failed to decode (must stay 0 unless a test forges one). */
  refused: number;
}

function makePort(hub: Hub, self: PeerId): Port {
  const messages = new Set<(from: PeerId, msg: WireMsg) => void>();
  const peers = new Set<(peer: PeerId, state: PeerState) => void>();
  const bad = new Set<(from: PeerId, reason: string) => void>();
  const port: Port = {
    self,
    messages,
    bad,
    peers,
    closed: false,
    refused: 0,
    send: (peer, msg) => {
      hub.deliver(self, peer, msg);
    },
    broadcast: (msg) => {
      for (const peer of hub.neighbours(self)) {
        hub.deliver(self, peer, msg);
      }
    },
    onMessage: (cb): Unsubscribe => {
      messages.add(cb);
      return () => {
        messages.delete(cb);
      };
    },
    onBad: (cb): Unsubscribe => {
      bad.add(cb);
      return () => {
        bad.delete(cb);
      };
    },
    onPeer: (cb): Unsubscribe => {
      peers.add(cb);
      return () => {
        peers.delete(cb);
      };
    },
    close: () => {
      port.closed = true;
    },
  };
  return port;
}

export class Hub {
  now = 0;
  readonly #rand: () => number;
  readonly #latency: Latency;
  readonly #ports = new Map<PeerId, Port>();
  readonly #links = new Set<string>();
  readonly #lastOnLink = new Map<string, number>();
  readonly #queue: Event[] = [];
  #seq = 0;
  /** Messages delivered, by kind. */
  readonly delivered = new Map<string, number>();

  constructor(seed: number, latency: Latency) {
    this.#rand = rng(seed);
    this.#latency = latency;
  }

  port(id: PeerId): Port {
    let p = this.#ports.get(id);
    if (p === undefined) {
      p = makePort(this, id);
      this.#ports.set(id, p);
    }
    return p;
  }

  /** A link between two peers (both directions). */
  connect(a: PeerId, b: PeerId): void {
    this.#links.add(`${a}>${b}`);
    this.#links.add(`${b}>${a}`);
  }

  neighbours(id: PeerId): PeerId[] {
    return [...this.#links].filter((l) => l.startsWith(`${id}>`)).map((l) => l.slice(id.length + 1));
  }

  #schedule(from: PeerId, to: PeerId, run: () => void): void {
    const key = `${from}>${to}`;
    const wanted = this.now + this.#latency.min + this.#rand() * (this.#latency.max - this.#latency.min);
    // Per link, delivery stays in send order (the channel is reliable and ordered).
    const at = Math.max(wanted, this.#lastOnLink.get(key) ?? 0);
    this.#lastOnLink.set(key, at);
    this.#queue.push({ at, seq: this.#seq, run });
    this.#seq += 1;
  }

  deliver(from: PeerId, to: PeerId, msg: WireMsg): void {
    if (!this.#links.has(`${from}>${to}`)) {
      return;
    }
    const text = encodeMsg(msg);
    this.#schedule(from, to, () => {
      const target = this.#ports.get(to);
      if (target === undefined || target.closed) {
        return;
      }
      const decoded = decodeMsg(text);
      if (!decoded.ok) {
        target.refused += 1;
        for (const cb of [...target.bad]) {
          cb(from, decoded.reason);
        }
        return;
      }
      this.delivered.set(decoded.msg.t, (this.delivered.get(decoded.msg.t) ?? 0) + 1);
      for (const cb of [...target.messages]) {
        cb(from, decoded.msg);
      }
    });
  }

  /** Takes `id` off the network: its neighbours see it go down after what it already sent. */
  cut(id: PeerId): void {
    for (const other of this.neighbours(id)) {
      this.#schedule(id, other, () => {
        const target = this.#ports.get(other);
        if (target !== undefined && !target.closed) {
          for (const cb of [...target.peers]) {
            cb(id, 'down');
          }
        }
      });
      this.#links.delete(`${id}>${other}`);
      this.#links.delete(`${other}>${id}`);
    }
    this.port(id).closed = true;
  }

  /** Delivers everything due up to `time` in (time, send) order and sets the clock there. */
  advance(time: number): void {
    for (;;) {
      this.#queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const [next] = this.#queue;
      if (next === undefined || next.at > time) {
        break;
      }
      this.#queue.shift();
      this.now = next.at;
      next.run();
    }
    this.now = time;
  }

  refused(): number {
    return [...this.#ports.values()].reduce((n, p) => n + p.refused, 0);
  }
}
