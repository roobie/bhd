// Metrics 14, 15: the penitent's Pain banked and spent, and its Martyrdom nova damage. The log has
// no Pain amounts (`resource` events carry bands only), so Pain is rebuilt from the damage it banks
// from; docs/METRICS.md lists the assumptions.

import { ticks } from '../../sim/time.ts';
import type { GameLog, MetricDef } from '../types.ts';
import { buildIndex, type GameIndex } from './gameindex.ts';

/** Martyrdom's ability slot (the ultimate; see hero.ts). */
const MARTYRDOM_SLOT = 3;

interface Knobs {
  readonly ffMult: number;
  readonly hpLossMult: number;
  readonly seconds: number;
  readonly novaMult: number;
}

/** The resolved penitent def's numbers, neutral ones for a game that has no penitent. */
function penitentKnobs(log: GameLog): Knobs {
  const def = log.header.resolved.game.heroes.find((h) => h.kit === 'penitent');
  if (def?.kit !== 'penitent') {
    return { ffMult: 1, hpLossMult: 1, seconds: 0, novaMult: 1 };
  }
  return {
    ffMult: def.pain.friendlyFireMult,
    hpLossMult: def.martyrdom.hpLossMult,
    seconds: def.martyrdom.seconds,
    novaMult: def.martyrdom.novaPainMult,
  };
}

function isPenitent(ix: GameIndex, id: number): boolean {
  return ix.entities.get(id)?.def === 'penitent';
}

interface Hit {
  readonly tick: number;
  readonly dst: number;
  readonly amount: number;
}

/** Martyrdom nova hits: `splash` damage from the penitent. */
function novaHits(log: GameLog, ix: GameIndex): Hit[] {
  const out: Hit[] = [];
  log.events.forEach((e, i) => {
    if (e.kind === 'dmg' && e.tags.includes('splash') && isPenitent(ix, e.src)) {
      out.push({ tick: e.tick, dst: e.dst, amount: ix.effDamage[i] ?? 0 });
    }
  });
  return out;
}

export const penitentPain: MetricDef = {
  id: 'penitent.pain',
  title: 'Penitent Pain banked and spent (estimated from the log)',
  unit: 'pain',
  areas: ['penitent.pain'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const k = penitentKnobs(log);
    const windowTicks = ticks(k.seconds);
    // Martyrdom casts: Pain banks the raw damage, and hp loss is only hpLossMult of it inside the window.
    const casts = log.events.flatMap((e) =>
      e.kind === 'ability' && e.slot === MARTYRDOM_SLOT && isPenitent(ix, e.hero) ? [e] : [],
    );
    let banked = 0;
    log.events.forEach((e, i) => {
      if (e.kind !== 'dmg' || !isPenitent(ix, e.dst)) {
        return;
      }
      const inside = casts.some((c) => e.tick >= c.tick && e.tick < c.tick + windowTicks);
      const raw = (ix.effDamage[i] ?? 0) / (inside && k.hpLossMult > 0 ? k.hpLossMult : 1);
      banked += e.tags.includes('ff') ? raw * k.ffMult : raw;
    });
    // Spent: the cast's `value` when the kit fills it, else the biggest nova hit of the burst / novaPainMult.
    let spent = 0;
    const hits = novaHits(log, ix);
    for (const c of casts) {
      if (c.value > 0) {
        spent += c.value;
      } else if (k.novaMult > 0) {
        const end = c.tick + windowTicks;
        const burst = hits.filter((h) => h.tick >= end - 1 && h.tick <= end + 1);
        spent += Math.max(0, ...burst.map((h) => h.amount)) / k.novaMult;
      }
    }
    return { banked, spent };
  },
};

export const penitentNova: MetricDef = {
  id: 'penitent.nova',
  title: 'Martyrdom nova damage: to enemies, and to allies (friendly fire)',
  unit: 'hp',
  areas: ['penitent.nova'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    let enemies = 0;
    let allies = 0;
    for (const h of novaHits(log, ix)) {
      if (ix.entities.get(h.dst)?.team === 1) {
        enemies += h.amount;
      } else {
        allies += h.amount;
      }
    }
    return { enemies, allies };
  },
};
