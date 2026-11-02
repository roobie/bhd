// Wire protocol: every message kind round-trips, and malformed input is refused without throwing.

import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_TICKS, RUN_ABI } from '../../src/match/run.ts';
import {
  decodeMsg,
  encodeMsg,
  MAX_MSG_LENGTH,
  PROTOCOL_VERSION,
  validateMsg,
  type WireKind,
  type WireMsg,
} from '../../src/net/types.ts';
import { SYSTEM_PLAYER } from '../../src/sim/commands.ts';

const SPEC = {
  abi: RUN_ABI,
  seed: 7,
  mode: 'director',
  doctrines: ['a', 'b', 'c', 'd'],
  reactionSeconds: 0.3,
  thinkSeconds: 0.2,
  maxTicks: DEFAULT_MAX_TICKS,
  hashEvery: 30,
  humans: [0, 2],
} as const;

const SAMPLES: readonly WireMsg[] = [
  { t: 'hello', abi: PROTOCOL_VERSION, fingerprint: 'abc123', name: 'ann' },
  { t: 'lobby', slots: ['p1', null, 'p2', null], mode: 'schedule', seed: 42 },
  {
    t: 'start',
    spec: SPEC,
    seats: [
      { peer: 'p1', players: [0] },
      { peer: 'p2', players: [2] },
    ],
    delay: 3,
  },
  { t: 'input', player: 1, cmd: { kind: 'move', hero: 3, x: 1.5, y: -2 }, wantTick: 12 },
  {
    t: 'seal',
    tick: 12,
    inputs: [
      { player: 0, cmd: { kind: 'stop', hero: 2 } },
      { player: SYSTEM_PLAYER, cmd: { kind: 'control', op: 'drive', slot: 1, by: 'bot' } },
    ],
  },
  { t: 'seal', tick: 13, inputs: [] },
  { t: 'hash', tick: 30, hash: 'deadbeef' },
  { t: 'desync', tick: 60 },
  { t: 'pause', by: 1 },
  { t: 'resume', by: 1 },
  { t: 'drop', peer: 'p2', atTick: 99 },
  { t: 'bye' },
  { t: 'ping', n: 5 },
  { t: 'pong', n: 5 },
];

const KINDS: readonly WireKind[] = [
  'hello',
  'lobby',
  'start',
  'input',
  'seal',
  'hash',
  'desync',
  'pause',
  'resume',
  'drop',
  'bye',
  'ping',
  'pong',
];

function refused(text: string): boolean {
  const res = decodeMsg(text);
  return !res.ok;
}

describe('wire protocol', () => {
  it('has a sample for every message kind', () => {
    expect([...new Set(SAMPLES.map((m) => m.t))].sort()).toEqual([...KINDS].sort());
  });

  it.each(SAMPLES.map((m) => [m.t, m] as const))('round-trips a %s', (_t, msg) => {
    const res = decodeMsg(encodeMsg(msg));
    expect(res).toEqual({ ok: true, msg });
  });

  it('turns -0 in a command into 0 (the wire-safe form)', () => {
    const text = '{"t":"input","player":0,"wantTick":1,"cmd":{"kind":"move","hero":2,"x":-0,"y":0}}';
    const res = decodeMsg(text);
    expect(res.ok && res.msg.t === 'input' && Object.is(res.msg.cmd.kind === 'move' ? res.msg.cmd.x : 1, 0)).toBe(true);
  });

  it('keeps the order of sealed inputs', () => {
    const inputs = [3, 0, 2, 0].map((player) => ({ player, cmd: { kind: 'stop', hero: player + 2 } as const }));
    const res = decodeMsg(encodeMsg({ t: 'seal', tick: 4, inputs }));
    expect(res.ok && res.msg.t === 'seal' ? res.msg.inputs.map((i) => i.player) : []).toEqual([3, 0, 2, 0]);
  });

  it('refuses what is not a message', () => {
    for (const text of [
      '',
      'nope',
      '[]',
      '42',
      'null',
      '"seal"',
      '{}',
      '{"t":7}',
      '{"t":"nope"}',
      '{"t":"toString"}',
    ]) {
      expect(refused(text)).toBe(true);
    }
    expect(validateMsg(undefined).ok).toBe(false);
    expect(refused('x'.repeat(MAX_MSG_LENGTH + 1))).toBe(true);
  });

  it('refuses malformed fields', () => {
    const bad: readonly unknown[] = [
      { t: 'hello', abi: '1', fingerprint: 'x', name: 'n' },
      { t: 'hello', abi: 1, fingerprint: 'x', name: 'n'.repeat(500) },
      { t: 'lobby', slots: ['p1', null, 'p2'], mode: 'schedule', seed: 1 },
      { t: 'lobby', slots: [1, null, null, null], mode: 'schedule', seed: 1 },
      { t: 'lobby', slots: [null, null, null, null], mode: 'chaos', seed: 1 },
      { t: 'start', spec: { ...SPEC, mode: 'x' }, seats: [], delay: 3 },
      { t: 'start', spec: SPEC, seats: [], delay: 0 },
      { t: 'start', spec: SPEC, seats: [{ peer: 'p', players: [9] }], delay: 3 },
      { t: 'input', player: 6, cmd: { kind: 'stop', hero: 2 }, wantTick: 1 },
      { t: 'input', player: 0, cmd: { kind: 'stop', hero: -1 }, wantTick: 1 },
      { t: 'input', player: 0, cmd: { kind: 'dance' }, wantTick: 1 },
      { t: 'input', player: 0, cmd: { kind: 'stop', hero: 2 }, wantTick: 1.5 },
      { t: 'input', player: 0, cmd: 'stop', wantTick: 1 },
      { t: 'seal', tick: -1, inputs: [] },
      { t: 'seal', tick: 1, inputs: {} },
      { t: 'seal', tick: 1, inputs: [{ player: 0 }] },
      { t: 'seal', tick: 1, inputs: [{ player: 0, cmd: { kind: 'control', op: 'drive', slot: 7, by: 'bot' } }] },
      { t: 'hash', tick: 1, hash: '' },
      { t: 'hash', tick: 1, hash: 5 },
      { t: 'desync', tick: 'x' },
      { t: 'pause', by: -1 },
      { t: 'drop', peer: '', atTick: 1 },
      { t: 'ping', n: Number.NaN },
    ];
    for (const m of bad) {
      expect(validateMsg(JSON.parse(JSON.stringify(m))).ok, JSON.stringify(m)).toBe(false);
    }
  });

  it('drops unknown extra fields', () => {
    const res = decodeMsg('{"t":"desync","tick":5,"extra":{"x":1}}');
    expect(res).toEqual({ ok: true, msg: { t: 'desync', tick: 5 } });
  });
});
