// Room state machine and TURN minting: plumbing invariants only.

import { describe, expect, it } from 'vitest';
import {
  createRoom,
  isRoomCode,
  joinRoom,
  leaveRoom,
  MAX_ROOM_PEERS,
  parseClientMsg,
  relaySignal,
  roomCode,
} from '../../worker/room.ts';
import { mintIceServers, STUN_ONLY } from '../../worker/turn.ts';

const offer = { kind: 'offer', data: 'sdp' } as const;

describe('room', () => {
  it('makes the first joiner host and tells the others of joins', () => {
    const room = createRoom();
    const a = joinRoom(room, 'a');
    expect(a.ok && a.out).toEqual([{ to: 'a', msg: { t: 'joined', self: 'a', host: 'a', peers: [] } }]);
    const b = joinRoom(room, 'b');
    expect(b.ok && b.out).toEqual([
      { to: 'b', msg: { t: 'joined', self: 'b', host: 'a', peers: ['a'] } },
      { to: 'a', msg: { t: 'presence', peer: 'b', state: 'join' } },
    ]);
  });

  it('caps the room and refuses duplicates', () => {
    const room = createRoom();
    for (let i = 0; i < MAX_ROOM_PEERS; i++) {
      expect(joinRoom(room, `p${i}`).ok).toBe(true);
    }
    expect(joinRoom(room, 'extra')).toEqual({ ok: false, reason: 'room full' });
    expect(joinRoom(room, 'p1')).toEqual({ ok: false, reason: 'already joined' });
  });

  it('relays only between present peers', () => {
    const room = createRoom();
    joinRoom(room, 'a');
    joinRoom(room, 'b');
    expect(relaySignal(room, 'a', 'b', offer)).toEqual([{ to: 'b', msg: { t: 'signal', from: 'a', payload: offer } }]);
    expect(relaySignal(room, 'a', 'zz', offer)[0]?.msg.t).toBe('error');
    expect(relaySignal(room, 'ghost', 'b', offer)).toEqual([]);
  });

  it('reports a leave, and a host leaving closes the room', () => {
    const room = createRoom();
    for (const p of ['a', 'b', 'c']) {
      joinRoom(room, p);
    }
    expect(leaveRoom(room, 'b')).toEqual([
      { to: 'a', msg: { t: 'presence', peer: 'b', state: 'leave' } },
      { to: 'c', msg: { t: 'presence', peer: 'b', state: 'leave' } },
    ]);
    expect(room.closed).toBe(false);
    const out = leaveRoom(room, 'a');
    expect(out.some((o) => o.to === 'c' && o.msg.t === 'host-left')).toBe(true);
    expect(joinRoom(room, 'd')).toEqual({ ok: false, reason: 'room closed' });
    expect(leaveRoom(room, 'nobody')).toEqual([]);
  });

  it('makes 4-letter codes and validates client messages', () => {
    const rolls = [0.01, 0.3, 0.6, 0.99];
    const code = roomCode(() => rolls.shift() ?? 0);
    expect(isRoomCode(code)).toBe(true);
    expect(isRoomCode('ab1')).toBe(false);
    expect(parseClientMsg({ t: 'relay', to: 'b', payload: offer })?.to).toBe('b');
    expect(parseClientMsg({ t: 'relay', to: 'b', payload: { kind: 'x', data: '' } })).toBeUndefined();
    expect(parseClientMsg(null)).toBeUndefined();
    expect(parseClientMsg({ t: 'nope' })).toBeUndefined();
  });
});

describe('turn', () => {
  it('returns STUN only without secrets or on failure', async () => {
    const never = () => Promise.reject(new Error('unused'));
    expect(await mintIceServers({}, never)).toBe(STUN_ONLY);
    expect(await mintIceServers({ TURN_KEY_ID: 'k', TURN_KEY_TOKEN: 't' }, never)).toBe(STUN_ONLY);
  });

  it('returns the minted servers with the secrets', async () => {
    const servers = [{ urls: ['turn:x'], username: 'u', credential: 'c' }];
    let auth = '';
    const got = await mintIceServers({ TURN_KEY_ID: 'k', TURN_KEY_TOKEN: 't' }, (_u, init) => {
      auth = init.headers.authorization ?? '';
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ iceServers: servers }) });
    });
    expect(got).toEqual(servers);
    expect(auth).toBe('Bearer t');
  });
});
