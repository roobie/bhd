import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { dealDamage } from '../../src/sim/combat.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { applyStatus, hasStatus, statusValue } from '../../src/sim/statuses.ts';

// Wave-1 stubs: these pin the contract combat-core builds on, not final combat rules.
// Context for direct calls is built by hand; the Sim's own is private.

interface Rig {
  readonly sim: Sim;
  readonly events: SimEvent[];
  readonly ctx: Parameters<typeof dealDamage>[0];
}

function rig(): Rig {
  const sim = new Sim({ seed: 1, game: defaultGame() });
  const events: SimEvent[] = [];
  const killers = new Map<number, number>();
  const ctx: Rig['ctx'] = {
    tick: 10,
    entities: sim.entities,
    rng: sim.rng,
    emit: (e) => {
      events.push(e);
    },
    game: sim.game,
    waves: sim.waves,
    ancientId: 1,
    killers,
    end: () => undefined,
  };
  return { sim, events, ctx };
}

describe('dealDamage stub', () => {
  it('subtracts hp, emits dmg with the tags, returns the amount', () => {
    const { sim, events, ctx } = rig();
    const dealt = dealDamage(ctx, { src: 2, dst: 3, amount: 25, tags: ['pierce'] });
    expect(dealt).toBe(25);
    expect(sim.entities.get(3)?.hp).toBe(875);
    expect(events).toEqual([{ tick: 10, kind: 'dmg', src: 2, dst: 3, amount: 25, tags: ['pierce'] }]);
  });

  it('never removes the victim, and records the killer once hp reaches 0', () => {
    const { sim, ctx } = rig();
    dealDamage(ctx, { src: 2, dst: 4, amount: 1000, tags: [] });
    expect(sim.entities.get(4)?.hp).toBeLessThanOrEqual(0);
    expect(ctx.killers.get(4)).toBe(2);
    dealDamage(ctx, { src: 3, dst: 4, amount: 5, tags: [] });
    expect(ctx.killers.get(4)).toBe(2);
  });

  it('does nothing for missing victims, dead victims and non-positive amounts', () => {
    const { events, ctx } = rig();
    expect(dealDamage(ctx, { src: 2, dst: 99, amount: 5, tags: [] })).toBe(0);
    expect(dealDamage(ctx, { src: 2, dst: 3, amount: 0, tags: [] })).toBe(0);
    expect(dealDamage(ctx, { src: 2, dst: 3, amount: -4, tags: [] })).toBe(0);
    expect(events).toEqual([]);
  });
});

describe('status stub', () => {
  it('applies, reports has/value, and emits status on', () => {
    const { sim, events, ctx } = rig();
    applyStatus(ctx, 3, { status: 'suppressed', src: 2, durationTicks: 90, value: 0.4 });
    const tank = sim.entities.get(3);
    expect(tank?.statuses).toEqual([{ status: 'suppressed', until: 100, src: 2, value: 0.4 }]);
    expect(tank !== undefined && hasStatus(tank, 'suppressed')).toBe(true);
    expect(tank !== undefined && hasStatus(tank, 'marked')).toBe(false);
    expect(tank !== undefined && statusValue(tank, 'suppressed')).toBe(0.4);
    expect(tank !== undefined && statusValue(tank, 'marked')).toBe(0);
    expect(events).toEqual([{ tick: 10, kind: 'status', dst: 3, status: 'suppressed', on: true, src: 2 }]);
  });

  it('keeps instances sorted by status then src and refreshes the same (status, src)', () => {
    const { sim, ctx } = rig();
    applyStatus(ctx, 3, { status: 'marked', src: 5, durationTicks: 10, value: 1 });
    applyStatus(ctx, 3, { status: 'exposed', src: 4, durationTicks: 10, value: 1 });
    applyStatus(ctx, 3, { status: 'marked', src: 2, durationTicks: 10, value: 1 });
    applyStatus(ctx, 3, { status: 'marked', src: 5, durationTicks: 40, value: 2 });
    expect(sim.entities.get(3)?.statuses.map((s) => [s.status, s.src, s.until, s.value])).toEqual([
      ['exposed', 4, 20, 1],
      ['marked', 2, 20, 1],
      ['marked', 5, 50, 2],
    ]);
  });

  it('expires statuses when their time is up, emitting status off', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const tank = sim.entities.get(3);
    tank?.statuses.push({ status: 'marked', until: 3, src: 2, value: 0.25 });
    expect(sim.step().filter((e) => e.kind === 'status')).toEqual([]);
    expect(sim.step().filter((e) => e.kind === 'status')).toEqual([]);
    expect(sim.step().filter((e) => e.kind === 'status')).toEqual([
      { tick: 3, kind: 'status', dst: 3, status: 'marked', on: false, src: 2 },
    ]);
    expect(tank?.statuses).toEqual([]);
  });
});
