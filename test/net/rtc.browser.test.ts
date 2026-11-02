// Real WebRTC in one page: a host and two clients over a tiny in-page signalling hub.
// Chromium and firefox only; headless webkit WebRTC is unreliable.

import { afterEach, describe, expect, it } from 'vitest';
import { createRtcTransport } from '../../src/net/rtc.ts';
import type {
  PeerId,
  RoomInfo,
  Signalling,
  SignalPayload,
  Transport,
  Unsubscribe,
  WireMsg,
} from '../../src/net/types.ts';

const ua = navigator.userAgent;
const webkit = /AppleWebKit/u.test(ua) && !/Chrome|Chromium|Firefox/u.test(ua);
const supported = typeof RTCPeerConnection !== 'undefined' && !webkit;

/** Test-local signalling: one room, microtask delivery, host = first to join. */
function createHub(): (id: PeerId) => Signalling {
  const members = new Map<
    PeerId,
    Signalling & { deliver: (from: PeerId, p: SignalPayload) => void; notify: (p: PeerId, s: 'join' | 'leave') => void }
  >();
  let host: PeerId | undefined;
  return (id) => {
    const sigCbs = new Set<(from: PeerId, p: SignalPayload) => void>();
    const presCbs = new Set<(p: PeerId, s: 'join' | 'leave') => void>();
    const sig = {
      join: (): Promise<RoomInfo> => {
        host ??= id;
        const peers = [...members.keys()];
        members.set(id, sig);
        for (const other of peers) {
          members.get(other)?.notify(id, 'join');
        }
        return Promise.resolve({ self: id, host, peers });
      },
      relay: (to: PeerId, payload: SignalPayload): void => {
        queueMicrotask(() => members.get(to)?.deliver(id, payload));
      },
      onSignal: (cb: (from: PeerId, p: SignalPayload) => void): Unsubscribe => {
        sigCbs.add(cb);
        return () => sigCbs.delete(cb);
      },
      onPresence: (cb: (p: PeerId, s: 'join' | 'leave') => void): Unsubscribe => {
        presCbs.add(cb);
        return () => presCbs.delete(cb);
      },
      get peers(): readonly PeerId[] {
        return [...members.keys()].filter((p) => p !== id);
      },
      close: (): void => {
        members.delete(id);
        for (const other of members.values()) {
          other.notify(id, 'leave');
        }
      },
      deliver: (from: PeerId, p: SignalPayload): void => {
        for (const cb of [...sigCbs]) {
          cb(from, p);
        }
      },
      notify: (p: PeerId, s: 'join' | 'leave'): void => {
        for (const cb of [...presCbs]) {
          cb(p, s);
        }
      },
    };
    return sig;
  };
}

interface Node {
  readonly t: Transport;
  readonly got: { from: PeerId; msg: WireMsg }[];
  readonly peers: string[];
}

const open: Transport[] = [];
const debugLog: string[] = [];
afterEach(() => {
  for (const t of open.splice(0)) {
    t.close();
  }
});

async function node(hub: (id: PeerId) => Signalling, id: PeerId): Promise<Node> {
  const signalling = hub(id);
  const info = await signalling.join('room');
  const t = createRtcTransport({
    self: id,
    host: info.host,
    signalling,
    iceServers: [],
    debug: (l) => debugLog.push(l),
  });
  open.push(t);
  const got: Node['got'] = [];
  const peers: string[] = [];
  t.onMessage((from, msg) => got.push({ from, msg }));
  t.onPeer((p, s) => peers.push(`${p}:${s}`));
  return { t, got, peers };
}

async function until(cond: () => boolean, what: string): Promise<void> {
  const end = Date.now() + 15_000;
  const poll = async (): Promise<void> => {
    if (cond()) {
      return;
    }
    if (Date.now() > end) {
      throw new Error(`timeout waiting for ${what}\n${debugLog.join('\n')}`);
    }
    await new Promise((r) => setTimeout(r, 20));
    await poll();
  };
  await poll();
}

describe.skipIf(!supported)('rtc transport', () => {
  it('a host and two clients exchange ordered messages and see down on close', async () => {
    const hub = createHub();
    const host = await node(hub, 'h');
    const a = await node(hub, 'a');
    const b = await node(hub, 'b');

    // Sent before the channels are open: buffered, then delivered in order.
    a.t.send('h', { t: 'ping', n: 0 });
    for (let n = 1; n < 50; n++) {
      a.t.send('h', { t: 'ping', n });
    }
    await until(() => host.peers.includes('a:up') && host.peers.includes('b:up'), 'peers up');
    expect(a.peers).toEqual(['h:up']);
    expect(b.peers).toEqual(['h:up']);

    await until(() => host.got.length >= 50, 'host receives 50');
    expect(host.got.map((g) => (g.msg as { n: number }).n)).toEqual(Array.from({ length: 50 }, (_, n) => n));
    expect(host.got.every((g) => g.from === 'a')).toBe(true);

    for (let n = 0; n < 30; n++) {
      host.t.broadcast({ t: 'pong', n });
    }
    host.t.send('b', { t: 'bye' });
    await until(() => a.got.length >= 30 && b.got.length >= 31, 'clients receive');
    expect(a.got.map((g) => g.msg)).toEqual(Array.from({ length: 30 }, (_, n) => ({ t: 'pong', n })));
    expect(b.got.at(-1)?.msg).toEqual({ t: 'bye' });
    expect(a.got.every((g) => g.from === 'h')).toBe(true);

    // Clients reach each other only through the host: no a-b link.
    a.t.send('b', { t: 'ping', n: 99 });
    b.t.send('h', { t: 'ping', n: 7 });
    await until(() => host.got.some((g) => g.from === 'b'), 'b to host');
    expect(b.got.some((g) => g.msg.t === 'ping')).toBe(false);

    // A client closing is seen as down by the host only.
    a.t.close();
    await until(() => host.peers.includes('a:down'), 'a down');
    expect(host.peers.filter((p) => p === 'b:down')).toHaveLength(0);

    // The host closing is seen as down by the remaining client.
    host.t.close();
    await until(() => b.peers.includes('h:down'), 'h down');
    expect(b.peers.filter((p) => p === 'h:down')).toHaveLength(1);
  }, 40_000);

  it('ignores sends to a peer with no link', async () => {
    const hub = createHub();
    const host = await node(hub, 'h');
    const a = await node(hub, 'a');
    await until(() => host.peers.includes('a:up'), 'up');
    a.t.send('nobody', { t: 'bye' });
    a.t.send('h', { t: 'ping', n: 1 });
    await until(() => host.got.length === 1, 'one message');
    expect(host.got[0]?.msg).toEqual({ t: 'ping', n: 1 });
  }, 40_000);
});
