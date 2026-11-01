// Log codec invariants: round trip, -0 normalisation, non-finite numbers rejected. No gameplay.

import { describe, expect, it } from 'vitest';
import type { GameSpec } from '../../src/match/run.ts';
import { RUN_ABI, runGame } from '../../src/match/run.ts';
import type { LogHeader } from '../../src/replay/log.ts';
import { decodeLog, encodeLog } from '../../src/replay/log.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SPEC: GameSpec = {
  abi: RUN_ABI,
  seed: 7,
  mode: 'director',
  doctrines: ['hold-the-line', 'hold-the-line', 'greedy', 'greedy'],
  reactionSeconds: 0.4,
  thinkSeconds: 0.5,
  maxTicks: 400,
  hashEvery: 30,
};

function headerFor(game: ReturnType<typeof runGame>): LogHeader {
  return {
    format: 'bhd-log',
    v: 1,
    abi: RUN_ABI,
    side: 'base',
    ref: 'main',
    sha: 'abc',
    dirty: false,
    fingerprint: 'f',
    spec: SPEC,
    resolved: game.resolved,
    end: game.end,
    ticks: game.ticks,
  };
}

describe('log codec', () => {
  const game = runGame(SPEC);
  const header = headerFor(game);

  it('round trips a real game', () => {
    const text = encodeLog(header, game.events);
    const back = decodeLog(text);
    expect(back.header).toEqual(JSON.parse(JSON.stringify(header)));
    expect(back.events).toEqual(game.events);
    expect(encodeLog(back.header, back.events)).toBe(text);
  });

  it('is one header line then one line per event', () => {
    const lines = encodeLog(header, game.events).split('\n');
    expect(lines).toHaveLength(game.events.length + 2);
    expect(lines.at(-1)).toBe('');
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ format: 'bhd-log', v: 1 });
  });

  it('writes -0 as 0', () => {
    const e: SimEvent = { tick: 3, kind: 'heal', src: 1, dst: 2, amount: -0 };
    const text = encodeLog(header, [e]);
    expect(text).not.toContain('-0');
    const [back] = decodeLog(text).events;
    expect(back?.kind === 'heal' && Object.is(back.amount, 0)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects %s', (bad) => {
    const e: SimEvent = { tick: 3, kind: 'heal', src: 1, dst: 2, amount: bad };
    expect(() => encodeLog(header, [e])).toThrow(RangeError);
    expect(() => encodeLog({ ...header, ticks: bad }, [])).toThrow(RangeError);
  });

  it('rejects text that is not a log', () => {
    expect(() => decodeLog('')).toThrow();
    expect(() => decodeLog('{"format":"other"}\n')).toThrow();
    expect(() => decodeLog(`${JSON.stringify(header)}\nnot json\n`)).toThrow();
    expect(() => decodeLog(`${JSON.stringify(header)}\n{"x":1}\n`)).toThrow();
    expect(() => decodeLog(`${JSON.stringify({ ...header, v: 2 })}\n`)).toThrow();
  });
});
