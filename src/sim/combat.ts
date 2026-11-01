// Damage pipeline. Owner: combat-core.

import type { TickContext } from './context.ts';
import type { Entity } from './entities.ts';
import { hasStatus, removeStatus, statusValue } from './statuses.ts';

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
  /** Informational (e.g. `ability:<id>`); the `heal` event does not carry them yet. */
  readonly tags: readonly string[];
}

/** Restores hp up to maxHp and emits `heal`; returns the amount actually healed. No-op on dead or missing units and on the Ancient. */
export function heal(ctx: TickContext, spec: HealSpec): number {
  const target = ctx.entities.get(spec.dst);
  if (target === undefined || target.kind === 'ancient' || target.hp <= 0 || !(spec.amount > 0)) {
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

/** Armour never cuts a hit below this fraction of the (modified) raw amount. */
const MIN_DAMAGE_FRACTION = 0.2;

/** Tags that mark an area hit; Clumped targets take bonus damage from them (provisional). */
const AREA_TAGS: readonly string[] = ['line', 'cone', 'splash'];

/** True when friendly-fire rules (and the self-hit rule) drop this non-leak hit. */
function blockedByTeam(ctx: TickContext, spec: DamageSpec, victim: Readonly<Entity>): boolean {
  if (spec.src === spec.dst) {
    return true;
  }
  const attacker = ctx.entities.get(spec.src);
  return attacker !== undefined && attacker.team === victim.team && !spec.tags.includes('ff');
}

/** Marked, Clumped and armour applied to a non-leak hit (steps 3-5 of the pipeline). */
function modify(ctx: TickContext, spec: DamageSpec, victim: Entity): number {
  let { amount } = spec;
  if (hasStatus(victim, 'marked')) {
    amount *= 1 + Math.max(0, statusValue(victim, 'marked'));
    removeStatus(ctx, victim.id, 'marked');
  }
  if (hasStatus(victim, 'clumped') && spec.tags.some((t) => AREA_TAGS.includes(t))) {
    amount *= 1 + Math.max(0, statusValue(victim, 'clumped'));
  }
  if (!spec.tags.includes('pierce')) {
    const armour = Math.max(0, victim.armour - statusValue(victim, 'exposed'));
    amount = Math.max(amount - armour, amount * MIN_DAMAGE_FRACTION);
  }
  return amount;
}

/**
 * Applies damage and emits `dmg` (final amount, tags unchanged); returns the amount dealt. Never
 * removes entities: the deaths system does. Records the killer in `ctx.killers` when this hit takes
 * the victim to 0 hp. Returns 0 and emits nothing for missing/dead victims, non-positive amounts
 * and blocked friendly fire.
 *
 * Pipeline, in order:
 * 1. `leak` tag: the exact amount, nothing else applies (no ff check, no statuses consumed).
 *    The Ancient (kind 'ancient') takes damage only from `leak`: any other hit on it, ff or overpen
 *    included, is dropped (0, no event). Lead default, provisional; see
 *    .work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md Risks.
 * 2. Friendly fire: a hit with src === dst never applies, even with `ff` (lead default,
 *    provisional, same DESIGN.md Risks). Otherwise, if src and dst are on the same team (a self hit included) the hit is dropped
 *    unless the tags contain `ff`. An unknown src (e.g. 0) counts as hostile.
 * 3. Marked on the victim: amount *= 1 + max Marked value, then all Marked instances are consumed
 *    (removeStatus, so `status` off events fire). One hit gets the bonus, whichever tags it has.
 * 4. Clumped on the victim: if the hit has a `line`, `cone` or `splash` tag, amount *= 1 + max
 *    Clumped value. Not consumed; it expires on its own.
 * 5. Armour: effective = max(0, armour - max Exposed value). Unless the hit has the `pierce` tag,
 *    amount = max(amount - effective, amount * 0.2): armour never removes more than 80% of a hit.
 */
export function dealDamage(ctx: TickContext, spec: DamageSpec): number {
  const victim = ctx.entities.get(spec.dst);
  if (victim === undefined || victim.hp <= 0 || !(spec.amount > 0)) {
    return 0;
  }
  const leak = spec.tags.includes('leak');
  if (!leak && (victim.kind === 'ancient' || blockedByTeam(ctx, spec, victim))) {
    return 0;
  }
  const amount = leak ? spec.amount : modify(ctx, spec, victim);
  victim.hp -= amount;
  if (victim.hp <= 0) {
    ctx.killers.set(victim.id, spec.src);
  }
  ctx.emit({ tick: ctx.tick, kind: 'dmg', src: spec.src, dst: spec.dst, amount, tags: spec.tags });
  return amount;
}
