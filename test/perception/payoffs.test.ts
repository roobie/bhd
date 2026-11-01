import { describe, expect, it } from 'vitest';
import { createPayoffTracker, foldPayoffs, type Payoff } from '../../src/perception/payoffs.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const spawn = (tick: number, id: number, team: 0 | 1): SimEvent => ({ tick, kind: 'spawn', id, def: 'x', team });
const on = (tick: number, dst: number, status: string, src: number): SimEvent => ({
  tick,
  kind: 'status',
  dst,
  status,
  on: true,
  src,
});
const off = (tick: number, dst: number, status: string, src: number): SimEvent => ({
  tick,
  kind: 'status',
  dst,
  status,
  on: false,
  src,
});
const dmg = (tick: number, src: number, dst: number, tags: string[] = []): SimEvent => ({
  tick,
  kind: 'dmg',
  src,
  dst,
  amount: 3,
  tags,
});
const intent = (tick: number, op: 'fire' | 'fulfil' | 'reserve', id: number, by: number): SimEvent => ({
  tick,
  kind: 'intent',
  id,
  op,
  by,
  intentKind: 'pull',
});

const world = [spawn(0, 1, 0), spawn(0, 2, 0), spawn(0, 10, 1), spawn(0, 11, 1)];

describe('cash-ins', () => {
  it('Marked consumed by another hero is a cash-in; by its own applier is not', () => {
    const base = [...world, on(1, 10, 'marked', 1)];
    const other = foldPayoffs([...base, off(5, 10, 'marked', 1), dmg(5, 2, 10)]);
    expect(other.map((p) => [p.kind, p.label, p.applier, p.casher, p.target])).toEqual([
      ['cashin', 'marked', 1, 2, 10],
    ]);
    expect(foldPayoffs([...base, off(5, 10, 'marked', 1), dmg(5, 1, 10)])).toEqual([]);
  });

  it('Marked that merely expires is not a cash-in', () => {
    expect(foldPayoffs([...world, on(1, 10, 'marked', 1), off(40, 10, 'marked', 1)])).toEqual([]);
  });

  it('Exposed pays out once per application, to a different hero', () => {
    const out = foldPayoffs([...world, on(1, 10, 'exposed', 1), dmg(3, 2, 10), dmg(4, 2, 10)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: 'exposed', applier: 1, casher: 2, target: 10, tick: 3 });
    expect(foldPayoffs([...world, on(1, 10, 'exposed', 1), dmg(3, 1, 10)])).toEqual([]);
  });

  it('Clumped needs an area hit and groups the targets of one tick', () => {
    const stream = [...world, on(1, 10, 'clumped', 1), on(1, 11, 'clumped', 1)];
    expect(foldPayoffs([...stream, dmg(3, 2, 10)])).toEqual([]);
    const out = foldPayoffs([...stream, dmg(3, 2, 10, ['cone']), dmg(3, 2, 11, ['cone'])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: 'clumped', count: 2, casher: 2, applier: 1 });
  });

  it('ignores friendly fire and hits before the status landed', () => {
    expect(foldPayoffs([...world, on(2, 10, 'exposed', 1), dmg(2, 2, 10)])).toEqual([]);
    expect(foldPayoffs([...world, on(1, 2, 'exposed', 1), dmg(3, 1, 2, ['ff'])])).toEqual([]);
  });

  it('is incremental: pushing per tick equals one fold', () => {
    const all = [...world, on(1, 10, 'exposed', 1), dmg(3, 2, 10), intent(4, 'fire', 7, 1)];
    const t = createPayoffTracker();
    const piecewise: Payoff[] = [];
    for (const tick of [0, 1, 3, 4]) {
      piecewise.push(...t.push(all.filter((e) => e.tick === tick)));
    }
    expect(piecewise).toEqual(foldPayoffs(all));
  });
});

describe('wombos', () => {
  it('a pull with two fulfilments inside the window is one wombo', () => {
    const out = foldPayoffs([intent(10, 'fire', 7, 1), intent(12, 'fulfil', 7, 2), intent(20, 'fulfil', 7, 3)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'wombo', intentId: 7, applier: 1, casher: 3, count: 2, tick: 20 });
  });

  it('one fulfilment, late fulfilments and other intent kinds are not wombos', () => {
    expect(foldPayoffs([intent(10, 'fire', 7, 1), intent(12, 'fulfil', 7, 2)])).toEqual([]);
    expect(foldPayoffs([intent(10, 'fire', 7, 1), intent(500, 'fulfil', 7, 2), intent(501, 'fulfil', 7, 3)])).toEqual(
      [],
    );
    const other = (tick: number, op: 'fire' | 'fulfil', by: number): SimEvent => ({
      tick,
      kind: 'intent',
      id: 8,
      op,
      by,
      intentKind: 'effect',
    });
    expect(foldPayoffs([other(1, 'fire', 1), other(2, 'fulfil', 2), other(3, 'fulfil', 3)])).toEqual([]);
  });
});
