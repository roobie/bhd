import { describe, expect, it } from 'vitest';
import { parseRoomConfig, parseShellHash } from '../../../src/client/shell/config.ts';
import { createLobby, type Lobby, makeRoomCode, START_DELAY } from '../../../src/client/shell/lobbystate.ts';
import { type PeerId, PROTOCOL_VERSION, type WireMsg } from '../../../src/net/types.ts';

const FULL = /full/u;

const noop = (): void => undefined;
const FOUR_LETTERS = /^[A-Z]{4}$/u;

type Start = Extract<WireMsg, { t: 'start' }>;

/** A star of lobbies over a synchronous in-memory hub; the first id is the host. */
function room(ids: readonly string[], fingerprints: Readonly<Record<string, string>> = {}) {
  const host = ids[0] as PeerId;
  const lobbies = new Map<PeerId, Lobby>();
  const starts = new Map<PeerId, Start[]>();
  const deliver = (from: PeerId, to: PeerId, msg: WireMsg): void => {
    // Round-trip through JSON like a real link.
    lobbies.get(to)?.receive(from, JSON.parse(JSON.stringify(msg)) as WireMsg);
  };
  for (const id of ids) {
    const l = createLobby({
      self: id,
      host,
      name: `n-${id}`,
      fingerprint: fingerprints[id] ?? 'fp',
      send: (peer, msg) => deliver(id, peer, msg),
      broadcast: (msg) => {
        for (const other of ids) {
          if (other !== id && (id === host || other === host)) {
            deliver(id, other, msg);
          }
        }
      },
    });
    starts.set(id, []);
    l.onStart((s) => starts.get(id)?.push(s));
    lobbies.set(id, l);
  }
  for (const id of ids.slice(1)) {
    lobbies.get(host)?.peerUp(id);
    lobbies.get(id)?.peerUp(host);
  }
  return { lobbies, starts, get: (id: string): Lobby => lobbies.get(id) as Lobby, host };
}

describe('lobby state', () => {
  it('two peers pick slots and the host starts', () => {
    const r = room(['h', 'a']);
    r.get('a').pick(2);
    r.get('h').pick(0);
    for (const id of ['h', 'a']) {
      expect(r.get(id).view().slots).toEqual(['h', null, 'a', null]);
    }
    expect(r.get('a').view().names.get('h')).toBe('n-h');
    expect(r.get('a').view().canStart).toBe(false);
    expect(r.get('h').start()).toBe(true);
    const s = r.starts.get('a')?.[0] as Start;
    expect(s.delay).toBe(START_DELAY);
    expect(s.spec.humans).toEqual([0, 2]);
    expect(s.seats).toEqual([
      { peer: 'h', players: [0] },
      { peer: 'a', players: [2] },
    ]);
    expect(r.starts.get('h')?.[0]).toEqual(s);
    expect(r.get('a').view().phase).toBe('started');
  });

  it('four peers, one hero each, a mover releases its old slot', () => {
    const r = room(['h', 'a', 'b', 'c']);
    r.get('h').pick(3);
    r.get('a').pick(0);
    r.get('b').pick(1);
    r.get('c').pick(2);
    r.get('a').pick(1); // taken by b: refused
    expect(r.get('h').view().slots).toEqual(['a', 'b', 'c', 'h']);
    r.get('c').release();
    r.get('a').pick(2);
    expect(r.get('c').view().slots).toEqual([null, 'b', 'a', 'h']);
    expect(r.get('a').view().mySlot).toBe(2);
  });

  it('first come wins a conflicting claim and the loser is corrected', () => {
    const r = room(['h', 'a', 'b']);
    // b's claim reaches the host after a's: simulate by claiming locally on a stale view.
    r.get('a').pick(1);
    r.get('b').view(); // b already has slot 1 taken in its view, so it refuses locally
    r.get('b').pick(1);
    expect(r.get('b').view().slots[1]).toBe('a');
    // A forged request for a taken slot: the host answers with the truth.
    r.get('h').receive('b', { t: 'lobby', slots: [null, 'b', null, null], names: [], mode: 'schedule', seed: 9 });
    expect(r.get('h').view().slots).toEqual([null, 'a', null, null]);
    expect(r.get('h').view().mode).toBe('director');
    expect(r.get('h').view().seed).toBe(1);
  });

  it('only the host starts or changes settings', () => {
    const r = room(['h', 'a']);
    r.get('a').pick(0);
    expect(r.get('a').start()).toBe(false);
    r.get('a').setMode('schedule');
    r.get('a').setSeed(5);
    expect(r.get('h').view().mode).toBe('director');
    expect(r.get('h').view().seed).toBe(1);
    // A forged start from a non-host is ignored, too.
    const forged = { t: 'start', spec: {}, seats: [], delay: 3 } as unknown as WireMsg;
    r.get('h').receive('a', forged);
    expect(r.get('h').view().phase).toBe('lobby');
    r.get('h').setMode('schedule');
    r.get('h').setSeed(77);
    expect(r.get('a').view()).toMatchObject({ mode: 'schedule', seed: 77 });
    expect(r.get('h').start()).toBe(true);
    expect(r.starts.get('a')?.[0]?.spec).toMatchObject({ mode: 'schedule', seed: 77 });
  });

  it('the host cannot start with nobody seated, nor twice', () => {
    const r = room(['h', 'a']);
    expect(r.get('h').start()).toBe(false);
    r.get('a').pick(1);
    expect(r.get('h').view().canStart).toBe(true);
    expect(r.get('h').start()).toBe(true);
    expect(r.get('h').start()).toBe(false);
    r.get('h').pick(0); // ignored after start
    expect(r.get('h').view().slots).toEqual([null, 'a', null, null]);
  });

  it('a build fingerprint mismatch is an error for the joiner and a refusal on the host', () => {
    const r = room(['h', 'a', 'b'], { a: 'other' });
    const a = r.get('a').view();
    expect(a.phase).toBe('error');
    expect(a.error?.kind).toBe('mismatch');
    expect(r.get('h').view().rejected).toBe(1);
    r.get('a').pick(0); // the error is terminal: a is not seated
    expect(r.get('h').view().slots).toEqual([null, null, null, null]);
    r.get('b').pick(0);
    expect(r.get('h').view().slots[0]).toBe('b');
    expect(r.get('h').start()).toBe(true);
    expect(r.starts.get('a')).toEqual([]);
  });

  it('a protocol version mismatch is refused', () => {
    const l = createLobby({ self: 'a', host: 'h', name: 'a', fingerprint: 'fp', send: noop, broadcast: noop });
    l.receive('h', { t: 'hello', abi: PROTOCOL_VERSION + 1, fingerprint: 'fp', name: 'h' });
    expect(l.view().phase).toBe('error');
  });

  it('a leaving peer frees its slot; the host leaving ends the joiners lobby', () => {
    const r = room(['h', 'a']);
    r.get('a').pick(3);
    r.get('h').peerDown('a');
    expect(r.get('h').view().slots).toEqual([null, null, null, null]);
    r.get('a').peerDown('h');
    expect(r.get('a').view().error?.kind).toBe('host-lost');
  });

  it('slot holders see every name; a joiner refused for a full room or a started game is told why', () => {
    const r = room(['h', 'a', 'b', 'c', 'd']);
    r.get('h').pick(0);
    r.get('a').pick(1);
    r.get('b').pick(2);
    // h, a, b, c fill the room; d is the fifth peer.
    expect(r.get('d').view().error?.message).toMatch(FULL);
    expect(r.get('d').view().error?.kind).toBe('refused');
    expect(r.get('b').view().names.get('a')).toBe('n-a');
    expect(r.get('a').view().names.get('b')).toBe('n-b');
    expect(r.get('h').start()).toBe(true);
    const late = createLobby({ self: 'x', host: 'h', name: 'x', fingerprint: 'fp', send: noop, broadcast: noop });
    late.receive('h', { t: 'refuse', reason: 'started' });
    expect(late.view().error?.kind).toBe('refused');
    const told: WireMsg[] = [];
    const host = createLobby({
      self: 'h',
      host: 'h',
      name: 'h',
      fingerprint: 'fp',
      send: (_p, m) => told.push(m),
      broadcast: noop,
    });
    host.pick(0);
    host.start();
    host.receive('x', { t: 'hello', abi: PROTOCOL_VERSION, fingerprint: 'fp', name: 'x' });
    expect(told).toEqual([{ t: 'refuse', reason: 'started' }]);
  });

  it('hello is sent to the host once a link is up', () => {
    const sent: [string, WireMsg][] = [];
    const l = createLobby({
      self: 'a',
      host: 'h',
      name: 'Ada',
      fingerprint: 'fp',
      send: (p, m) => sent.push([p, m]),
      broadcast: noop,
    });
    l.peerUp('x');
    l.peerUp('h');
    expect(sent).toEqual([['h', { t: 'hello', abi: PROTOCOL_VERSION, fingerprint: 'fp', name: 'Ada' }]]);
  });
});

describe('room config', () => {
  it('parses room and name from hash or query, solo without a room', () => {
    expect(parseRoomConfig('#room=abcd&name=Ada')).toEqual({ room: 'ABCD', name: 'Ada' });
    expect(parseRoomConfig('', '?room=local-x1')).toEqual({ room: 'local-x1', name: 'Player' });
    expect(parseRoomConfig('#seed=3').room).toBeUndefined();
    expect(parseRoomConfig('#room=a/b%20c').room).toBeUndefined();
    expect(parseRoomConfig(`#name=${'x'.repeat(99)}`).name).toHaveLength(32);
  });

  it('leaves the solo hash parse alone', () => {
    expect(parseShellHash('#room=ABCD&name=Ada&seed=5')).toEqual({ seed: 5, mode: 'director', drive: [0] });
  });

  it('makes four-letter codes', () => {
    expect(makeRoomCode(() => 0.5)).toMatch(FOUR_LETTERS);
  });
});
