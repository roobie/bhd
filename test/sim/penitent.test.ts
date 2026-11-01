// Penitent kit invariants (w8 slice A). No tuned numbers are asserted: only bounds, floors, locks and
// the specced rules (reset on down, nova never hits allies when the knob is off).

import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { dealDamage, heal } from '../../src/sim/combat.ts';
import { downKit } from '../../src/sim/heroes/index.ts';
import { commandPenitent, type PenitentRun, tickPenitent } from '../../src/sim/heroes/penitent.ts';
import { ticks } from '../../src/sim/time.ts';
import { rig } from '../combat/rig.ts';

const GUNNER = 2;
const PENITENT = 3;

function setup() {
  const r = rig();
  const hero = r.sim.entities.get(PENITENT);
  const def = defaultGame().heroes.find((h) => h.kit === 'penitent');
  if (hero === undefined || hero.kit?.kind !== 'penitent' || def === undefined || def.kit !== 'penitent') {
    throw new Error('no penitent in the default lineup');
  }
  const run: PenitentRun = { ctx: r.ctx, hero, kit: hero.kit, def };
  const cast = (slot: number): void => commandPenitent(run, { kind: 'ability', hero: hero.id, slot });
  const tick = (n: number): void => {
    for (let i = 0; i < n; i++) {
      tickPenitent(run);
    }
  };
  return { r, hero, kit: run.kit, def, run, cast, tick };
}

describe('Pain', () => {
  it('stays within 0..max under any damage and drain', () => {
    const { r, kit, def, tick } = setup();
    const foe = r.add();
    for (let i = 0; i < 40; i++) {
      dealDamage(r.ctx, { src: foe.id, dst: PENITENT, amount: 1, tags: [] });
      dealDamage(r.ctx, { src: GUNNER, dst: PENITENT, amount: 1, tags: ['ff'] });
      expect(kit.pain).toBeGreaterThanOrEqual(0);
      expect(kit.pain).toBeLessThanOrEqual(def.pain.max);
    }
    kit.pain = def.pain.max - 1;
    dealDamage(r.ctx, { src: foe.id, dst: PENITENT, amount: 5, tags: [] });
    expect(kit.pain).toBeLessThanOrEqual(def.pain.max);
    tick(ticks(60));
    expect(kit.pain).toBe(0);
  });

  it('banks friendly fire at least as much as enemy damage of the same raw size', () => {
    const a = setup();
    const b = setup();
    const foe = a.r.add();
    dealDamage(a.r.ctx, { src: foe.id, dst: PENITENT, amount: 50, tags: [] });
    dealDamage(b.r.ctx, { src: GUNNER, dst: PENITENT, amount: 50, tags: ['ff'] });
    expect(b.kit.pain).toBeGreaterThan(a.kit.pain);
  });

  it('resets when he goes down', () => {
    const { r, hero, kit } = setup();
    const foe = r.add();
    dealDamage(r.ctx, { src: foe.id, dst: PENITENT, amount: 80, tags: [] });
    expect(kit.pain).toBeGreaterThan(0);
    hero.hp = 0;
    downKit(r.ctx, hero);
    expect(kit.pain).toBe(0);
    expect(kit.martyrdomTicks).toBe(0);
    expect(kit.spentTicks).toBe(0);
  });

  it('heals on him restore less than the heal', () => {
    const { r, hero } = setup();
    hero.hp = 10;
    const healed = heal(r.ctx, { src: GUNNER, dst: PENITENT, amount: 40, tags: [] });
    expect(healed).toBeLessThan(40);
    expect(healed).toBeGreaterThan(0);
  });
});

describe('Martyrdom', () => {
  it('friendly fire never drops him below 1 hp while it lasts', () => {
    const { r, hero, kit, cast } = setup();
    r.add({ x: hero.x + 2, y: hero.y });
    cast(3);
    expect(kit.martyrdomTicks).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      dealDamage(r.ctx, { src: GUNNER, dst: PENITENT, amount: hero.maxHp, tags: ['ff'] });
      expect(hero.hp).toBeGreaterThanOrEqual(1);
    }
  });

  it('banks the full raw damage while taking less hp loss than the raw hit', () => {
    const plain = setup();
    const mart = setup();
    const foeA = plain.r.add();
    const foeB = mart.r.add();
    mart.cast(3);
    dealDamage(plain.r.ctx, { src: foeA.id, dst: PENITENT, amount: 100, tags: [] });
    dealDamage(mart.r.ctx, { src: foeB.id, dst: PENITENT, amount: 100, tags: [] });
    expect(mart.kit.pain).toBe(plain.kit.pain);
    expect(mart.hero.maxHp - mart.hero.hp).toBeLessThan(plain.hero.maxHp - plain.hero.hp);
  });

  it('ends in a nova on enemies only (knob off), then Spent locks Pain at 0 and cuts armour', () => {
    const { r, hero, kit, def, cast, tick } = setup();
    expect(def.martyrdom.novaHitsAllies).toBe(false);
    const gunner = r.sim.entities.get(GUNNER);
    const foe = r.add({ x: hero.x + 2, y: hero.y });
    if (gunner === undefined) {
      throw new Error('no gunner');
    }
    gunner.x = hero.x + 1;
    gunner.y = hero.y;
    const { armour } = hero;
    cast(3);
    dealDamage(r.ctx, { src: foe.id, dst: PENITENT, amount: 200, tags: [] });
    const foeHp = foe.hp;
    const gunnerHp = gunner.hp;
    tick(ticks(def.martyrdom.seconds) + 1);
    expect(kit.martyrdomTicks).toBe(0);
    expect(foe.hp).toBeLessThan(foeHp);
    expect(gunner.hp).toBe(gunnerHp);
    expect(kit.spentTicks).toBeGreaterThan(0);
    expect(hero.armour).toBeLessThanOrEqual(armour);
    for (let i = 0; i < 20; i++) {
      dealDamage(r.ctx, { src: foe.id, dst: PENITENT, amount: 30, tags: [] });
      dealDamage(r.ctx, { src: GUNNER, dst: PENITENT, amount: 30, tags: ['ff'] });
      expect(kit.pain).toBe(0);
      tick(1);
      expect(kit.pain).toBe(0);
    }
    tick(ticks(def.martyrdom.spentSeconds));
    expect(kit.spentTicks).toBe(0);
    expect(hero.armour).toBe(armour);
  });

  it('cannot be recast on cooldown or while Spent, and Chain is refused while Spent', () => {
    const { r, hero, kit, def, cast, tick } = setup();
    r.add({ x: hero.x + 2, y: hero.y });
    cast(3);
    const cd = kit.cdMartyrdom;
    expect(cd).toBeGreaterThan(0);
    tick(ticks(def.martyrdom.seconds) + 1);
    expect(kit.spentTicks).toBeGreaterThan(0);
    const events = r.events.length;
    cast(3);
    cast(0);
    expect(r.events.slice(events).filter((e) => e.kind === 'ability')).toEqual([]);
  });
});

describe('Chain of Penance', () => {
  it('taunts and Exposes enemies in reach, and does nothing with none', () => {
    const { r, hero, kit, cast } = setup();
    cast(0);
    expect(kit.cdChain).toBe(0);
    const foe = r.add({ x: hero.x + 2, y: hero.y });
    cast(0);
    expect(kit.cdChain).toBeGreaterThan(0);
    const names = foe.statuses.map((s) => s.status);
    expect(names).toContain('taunted');
    expect(names).toContain('exposed');
  });
});
