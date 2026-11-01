import { expect, test as it } from 'vitest';
import type { Checkpoint } from '../../src/replay/verify.ts';
import { checkpoints, verifyHashes } from '../../src/replay/verify.ts';
import type { SimEvent } from '../../src/sim/events.ts';

function cps(n: number, bad?: number): Checkpoint[] {
  return Array.from({ length: n }, (_, i) => ({ tick: (i + 1) * 30, stateHash: i === bad ? 'x' : `h${i}` }));
}

it('identical lists verify; a live prefix is verified so far', () => {
  expect(verifyHashes(cps(5), cps(5))).toEqual({ ok: true, checked: 5, through: 150 });
  expect(verifyHashes(cps(5), cps(2))).toEqual({ ok: true, checked: 2, through: 60 });
  expect(verifyHashes(cps(5), [])).toEqual({ ok: true, checked: 0, through: 0 });
});

it('finds the first mismatching checkpoint', () => {
  const live = cps(6, 3).map((c, i) => (i === 5 ? { ...c, stateHash: 'y' } : c));
  expect(verifyHashes(cps(6), live)).toEqual({ ok: false, tick: 120, expected: 'h3', actual: 'x' });
});

it('a tick that is off, or a checkpoint the log lacks, is a divergence', () => {
  const shifted = cps(4).map((c, i) => (i === 2 ? { ...c, tick: 91 } : c));
  expect(verifyHashes(cps(4), shifted)).toMatchObject({ ok: false, tick: 90 });
  expect(verifyHashes(cps(3), cps(4))).toEqual({ ok: false, tick: 120, expected: undefined, actual: 'h3' });
});

it('checkpoints picks the hash events out of a stream', () => {
  const events: SimEvent[] = [
    { tick: 1, kind: 'death', id: 1, killer: 0 },
    { tick: 30, kind: 'hash', stateHash: 'a' },
    { tick: 31, kind: 'death', id: 2, killer: 0 },
    { tick: 60, kind: 'hash', stateHash: 'b' },
  ];
  expect(checkpoints(events)).toEqual([
    { tick: 30, stateHash: 'a' },
    { tick: 60, stateHash: 'b' },
  ]);
});
