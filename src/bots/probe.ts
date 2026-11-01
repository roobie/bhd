// The probe brain: something minimal but real, used by the contract stubs (gunner, standins) until
// their slices replace them, and by tests. Two decisions: where to be (post / advance / hold) and
// whether to cast the first ready ability. Owner: contracts.

import type { AbilityView, EnemyView, HeroView } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import type { BotCtx, Brain, Decision, Option, SeatInfo } from './types.ts';
import { weight } from './utility.ts';

interface ProbeMemory {
  readonly post: SeatInfo['post'];
}

const NEAR = 1;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function nearest(me: HeroView, enemies: readonly EnemyView[]): EnemyView | undefined {
  let best: EnemyView | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const e of enemies) {
    const d = dist(me, e);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function moveTo(me: HeroView, x: number, y: number): Command[] {
  if (me.dest !== undefined && dist(me.dest, { x, y }) < NEAR) {
    return [];
  }
  return dist(me, { x, y }) < NEAR ? [] : [{ kind: 'move', hero: me.id, x, y }];
}

function placement(ctx: BotCtx, post: SeatInfo['post']): Decision {
  const { me, p, doctrine } = ctx;
  const target = nearest(me, p.enemies);
  const away = dist(me, post);
  // Advance a leash-limited step toward the nearest enemy; never beyond the leash around the post.
  let adv: Option = { id: 'advance', value: 0, cost: 1, commands: [] };
  if (target !== undefined) {
    const d = dist(post, target);
    const k = d > doctrine.leash ? doctrine.leash / d : 1;
    const x = post.x + (target.x - post.x) * k;
    const y = post.y + (target.y - post.y) * k;
    adv = { id: 'advance', value: doctrine.aggression, cost: 0, commands: moveTo(me, x, y) };
  }
  return {
    id: 'probe.post',
    options: [
      {
        id: 'post',
        value: 0.5 + Math.min(1, away / Math.max(1, doctrine.leash)),
        cost: 0,
        commands: moveTo(me, post.x, post.y),
      },
      adv,
      { id: 'hold', value: 0.3, cost: 0, commands: [] },
    ],
  };
}

function castAt(me: HeroView, ab: AbilityView, enemy: EnemyView): Command {
  if (ab.effect === 'mark') {
    return { kind: 'ability', hero: me.id, slot: ab.slot, target: enemy.id };
  }
  if (ab.range > 0) {
    return { kind: 'ability', hero: me.id, slot: ab.slot, x: enemy.x, y: enemy.y };
  }
  return { kind: 'ability', hero: me.id, slot: ab.slot };
}

function ability(ctx: BotCtx): Decision {
  const { me, p, weights } = ctx;
  const ab = me.abilities.find((a) => a.ready && a.effect !== 'brace');
  const enemy = nearest(me, p.enemies);
  const reach = ab === undefined ? 0 : Math.max(ab.range, ab.radius);
  const inReach = ab !== undefined && enemy !== undefined && dist(me, enemy) <= (reach > 0 ? reach : 12);
  const cast: Option =
    ab !== undefined && enemy !== undefined && inReach
      ? { id: 'cast', value: weight(weights, 'probe.cast', 1), cost: 0, commands: [castAt(me, ab, enemy)] }
      : { id: 'cast', value: 0, cost: 1, commands: [] };
  return { id: 'probe.ability', options: [{ id: 'wait', value: 0.1, cost: 0, commands: [] }, cast] };
}

export const probeBrain: Brain<ProbeMemory> = {
  init: (seat) => ({ post: seat.post }),
  think: (ctx, memory) => [placement(ctx, memory.post), ability(ctx)],
};
