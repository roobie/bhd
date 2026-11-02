// Signalling implementations against the `Signalling` contract: memory hub, WebSocket client over
// a fake socket wired to the room machine, and BroadcastChannel tabs.

import { describe, expect, it } from 'vitest';
import { createBroadcastSignalling, type LockManagerLike } from '../../src/net/signal/broadcast.ts';
import { createMemorySignalling } from '../../src/net/signal/memory.ts';
import { createWsSignalling, type SocketLike } from '../../src/net/signal/ws.ts';
import type { SignalPayload } from '../../src/net/types.ts';
import { createRoom, joinRoom, leaveRoom, type Outgoing, parseClientMsg, relaySignal } from '../../worker/room.ts';

const offer: SignalPayload = { kind: 'offer', data: 'sdp' };

describe('memory signalling', () => {
  it('hosts the first joiner, relays and reports presence', async () => {
    const hub = {};
    const a = createMemorySignalling(hub, 'a');
    const b = createMemorySignalling(hub, 'b');
    const seen: string[] = [];
    const got: string[] = [];
    expect(await a.join('ROOM')).toEqual({ self: 'a', host: 'a', peers: [] });
    a.onPresence((p, s) => seen.push(`${s}:${p}`));
    a.onSignal((from, p) => got.push(`${from}:${p.kind}`));
    expect(await b.join('ROOM')).toEqual({ self: 'b', host: 'a', peers: ['a'] });
    expect(a.peers).toEqual(['b']);
    b.relay('a', offer);
    expect(got).toEqual(['b:offer']);
    b.close();
    expect(seen).toEqual(['join:b', 'leave:b']);
    expect(a.peers).toEqual([]);
  });

  it('keeps rooms and hubs apart and rejects when full', async () => {
    const hub = {};
    const x = createMemorySignalling(hub, 'x');
    const y = createMemorySignalling(hub, 'y');
    await x.join('ONE');
    expect((await y.join('TWO')).peers).toEqual([]);
    const other = createMemorySignalling({}, 'z');
    expect((await other.join('ONE')).host).toBe('z');
    await Promise.all(['p0', 'p1', 'p2', 'p3', 'q'].map((p) => createMemorySignalling(hub, p).join('FULL')));
    await expect(createMemorySignalling(hub, 'late').join('FULL')).rejects.toThrow('room full');
  });
});

describe('ws signalling', () => {
  // A fake server: each socket is a peer in one shared room machine.
  function fakeServer() {
    const room = createRoom();
    const socks = new Map<string, FakeSocket>();
    const urls: string[] = [];
    let n = 0;
    const deliver = (out: readonly Outgoing[]) => {
      for (const o of out) {
        socks.get(o.to)?.onmessage?.({ data: JSON.stringify(o.msg) });
      }
    };
    class FakeSocket implements SocketLike {
      onopen = null;
      onmessage: SocketLike['onmessage'] = null;
      onclose = null;
      onerror = null;
      readonly id: string;
      constructor() {
        n += 1;
        this.id = `s${n}`;
        queueMicrotask(() => {
          socks.set(this.id, this);
          const j = joinRoom(room, this.id);
          deliver(j.ok ? j.out : []);
        });
      }
      send(data: string) {
        const m = parseClientMsg(JSON.parse(data));
        if (m) {
          deliver(relaySignal(room, this.id, m.to, m.payload));
        }
      }
      close() {
        deliver(leaveRoom(room, this.id));
      }
    }
    return {
      open: (url: string) => {
        urls.push(url);
        return new FakeSocket();
      },
      urls,
    };
  }

  it('joins, relays and tracks presence through the server protocol', async () => {
    const srv = fakeServer();
    const a = createWsSignalling('https://w.example/', srv);
    const b = createWsSignalling('https://w.example', srv);
    const info = await a.join('ABCD');
    expect(info.host).toBe(info.self);
    const got: string[] = [];
    const seen: string[] = [];
    a.onSignal((from, p) => got.push(`${from}:${p.data}`));
    a.onPresence((p, s) => seen.push(`${s}:${p}`));
    const bi = await b.join('ABCD');
    expect(bi.peers).toEqual([info.self]);
    b.relay(info.self, offer);
    expect(got).toEqual([`${bi.self}:sdp`]);
    b.close();
    expect(seen).toEqual([`join:${bi.self}`, `leave:${bi.self}`]);
    expect(srv.urls[0]).toBe('wss://w.example/ws/ABCD');
  });
});

describe('broadcast signalling', () => {
  it('lets two tabs meet in a local room, first is host', async () => {
    const a = createBroadcastSignalling({ id: 'A', settleMs: 30 });
    const b = createBroadcastSignalling({ id: 'B', settleMs: 30 });
    expect(await a.join('local-t1')).toEqual({ self: 'A', host: 'A', peers: [] });
    const got: string[] = [];
    const seen: string[] = [];
    a.onSignal((from, p) => got.push(`${from}:${p.kind}`));
    a.onPresence((p, s) => seen.push(`${s}:${p}`));
    expect(await b.join('local-t1')).toEqual({ self: 'B', host: 'A', peers: ['A'] });
    b.relay('A', offer);
    await new Promise((r) => setTimeout(r, 30));
    expect(got).toEqual(['B:offer']);
    expect(a.peers).toEqual(['B']);
    b.close();
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual(['join:B', 'leave:B']);
    a.close();
  });

  it('refuses non-local rooms', async () => {
    await expect(createBroadcastSignalling().join('ABCD')).rejects.toThrow();
  });

  /** A tiny Web Locks stand-in shared by the tabs of one test. */
  function fakeLocks(): LockManagerLike {
    const held = new Set<string>();
    return {
      request: async (name, _options, callback) => {
        if (held.has(name)) {
          return callback(null);
        }
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    };
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const [label, makeLocks] of [
    ['with locks', fakeLocks],
    ['without locks', () => null],
  ] as const) {
    it(`a tab that joins after the host left does not join the dead host (${label})`, async () => {
      const locks = makeLocks();
      const room = `local-dead-${label.replace(' ', '-')}`;
      const a = createBroadcastSignalling({ id: 'A', settleMs: 20, locks });
      const b = createBroadcastSignalling({ id: 'B', settleMs: 20, locks });
      await a.join(room);
      expect((await b.join(room)).host).toBe('A');
      a.close(); // the host leaves, B stays
      await wait(40);
      const c = createBroadcastSignalling({ id: 'C', settleMs: 20, locks });
      const info = await c.join(room);
      expect(info.host).not.toBe('A');
      expect(info.peers).toContain('B');
      b.close();
      c.close();
    });
  }

  it('two tabs opened in the same instant elect exactly one host (locks)', async () => {
    const locks = fakeLocks();
    const tabs = ['A', 'B', 'C'].map((id) => createBroadcastSignalling({ id, settleMs: 20, locks }));
    const infos = await Promise.all(tabs.map((t) => t.join('local-race')));
    const hosts = new Set(infos.map((i) => i.host));
    expect(hosts.size).toBe(1);
    expect(infos.filter((i) => i.host === i.self)).toHaveLength(1);
    for (const t of tabs) {
      t.close();
    }
  });
});

describe('ws signalling events', () => {
  function socketPair() {
    let sock: (SocketLike & { push: (m: unknown) => void }) | undefined;
    return {
      open: () => {
        const s = {
          onopen: null,
          onmessage: null as SocketLike['onmessage'],
          onclose: null as SocketLike['onclose'],
          onerror: null as SocketLike['onerror'],
          send: () => undefined,
          close: () => undefined,
          push: (m: unknown) => s.onmessage?.({ data: JSON.stringify(m) }),
        };
        sock = s;
        return s;
      },
      get sock() {
        return sock;
      },
    };
  }

  it('hands the ICE servers of the joined message to the caller', async () => {
    const pair = socketPair();
    const sig = createWsSignalling('https://w.example', pair);
    const joining = sig.join('ABCD');
    const ice = [{ urls: 'turn:t', username: 'u', credential: 'c' }];
    pair.sock?.push({ t: 'joined', self: 's1', host: 's1', peers: [], iceServers: ice });
    expect((await joining).iceServers).toEqual(ice);
  });

  it('surfaces host-left, errors and a closed socket after the join', async () => {
    const pair = socketPair();
    const sig = createWsSignalling('https://w.example', pair);
    const joining = sig.join('ABCD');
    pair.sock?.push({ t: 'joined', self: 's1', host: 'h', peers: ['h'] });
    await joining;
    const events: string[] = [];
    sig.onEvent?.((e) => events.push(e.kind));
    pair.sock?.push({ t: 'host-left', host: 'h' });
    pair.sock?.push({ t: 'error', reason: 'no such peer' });
    pair.sock?.onerror?.();
    pair.sock?.onclose?.();
    expect(events).toEqual(['host-left', 'error', 'error', 'closed']);
  });
});
