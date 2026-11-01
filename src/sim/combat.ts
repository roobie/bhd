// Damage pipeline. Owner: combat-core (armour, pierce, statuses, friendly-fire flag).
// STUB: hp -= amount.

import type { TickContext } from './context.ts';

export interface DamageSpec {
  readonly src: number;
  readonly dst: number;
  readonly amount: number;
  /**
   * e.g. `ff`, `overpen`, `pierce`, `splash`, `ability:<id>` (project DESIGN.md §6.6).
   * `leak` is special: leak damage bypasses armour and every modifier, so the Ancient loses exactly
   * the enemy's `leakDamage` (the `leak` event's `livesLost` relies on it).
   */
  readonly tags: readonly string[];
}

export interface HealSpec {
  readonly src: number;
  readonly dst: number;
  readonly amount: number;
  /** Reserved for combat-core (e.g. `ability:<id>`); not emitted yet. */
  readonly tags: readonly string[];
}

/** Restores hp up to maxHp and emits `heal`; returns the amount actually healed. No-op on dead or missing units. */
export function heal(ctx: TickContext, spec: HealSpec): number {
  const target = ctx.entities.get(spec.dst);
  if (target === undefined || target.hp <= 0 || !(spec.amount > 0)) {
    return 0;
  }
  const healed = Math.min(spec.amount, target.maxHp - target.hp);
  if (healed <= 0) {
    return 0;
  }
  target.hp += healed;
  ctx.emit({ tick: ctx.tick, kind: 'heal', src: spec.src, dst: spec.dst, amount: healed });
  return healed;
}

/**
 * Applies damage and emits `dmg`; returns the amount dealt. Never removes entities: the deaths
 * system does. Records the killer in `ctx.killers` when this hit takes the victim to 0 hp.
 */
export function dealDamage(ctx: TickContext, spec: DamageSpec): number {
  const victim = ctx.entities.get(spec.dst);
  if (victim === undefined || victim.hp <= 0 || !(spec.amount > 0)) {
    return 0;
  }
  victim.hp -= spec.amount;
  if (victim.hp <= 0) {
    ctx.killers.set(victim.id, spec.src);
  }
  ctx.emit({ tick: ctx.tick, kind: 'dmg', src: spec.src, dst: spec.dst, amount: spec.amount, tags: spec.tags });
  return spec.amount;
}
