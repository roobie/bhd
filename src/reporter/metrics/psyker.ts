// Metrics 16, 17: the psyker's time with Warp above its backlash threshold, and its Discharge
// backlashes (count and damage, friendly fire included). docs/METRICS.md lists the assumptions.

import type { GameLog, MetricDef } from '../types.ts';
import { heroDefAt } from './effective.ts';
import { aliveSpans, buildIndex, overlap } from './gameindex.ts';

/** Warp at or above this is "high" when the game has no psyker def (the design's 50). */
const DEFAULT_THRESHOLD = 50;

/** The backlash threshold of psyker entity `id` at `tick`: its effective def (accepted bargains patched in). */
function threshold(log: GameLog, id: number, tick: number): number {
  const def = heroDefAt(log, id, 'psyker', tick);
  return def?.kit === 'psyker' ? def.backlash.freeBelow : DEFAULT_THRESHOLD;
}

/**
 * Fraction of the psyker's alive time with Warp high. Warp surfaces as `resource` events of
 * `warp` whose `band` is the band's lower bound in Warp points (as heat's is); a band at or above
 * the backlash threshold counts as high.
 */
export const psykerWarpHigh: MetricDef = {
  id: 'psyker.warp.high',
  title: 'Psyker alive time with Warp at or above the backlash threshold',
  unit: 'fraction',
  areas: ['psyker.warp'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    let high = 0;
    let alive = 0;
    for (const p of ix.heroes.filter((h) => h.def === 'psyker')) {
      const spans = aliveSpans(ix, p);
      let band = 0;
      let at = p.spawnTick;
      for (const e of log.events) {
        if (e.kind === 'resource' && e.hero === p.id && e.resource === 'warp') {
          high += band >= threshold(log, p.id, at) ? overlap(spans, at, e.tick) : 0;
          ({ band } = e);
          at = Math.max(at, e.tick);
        }
      }
      high += band >= threshold(log, p.id, at) ? overlap(spans, at, ix.endTick) : 0;
      alive += overlap(spans, p.spawnTick, ix.endTick);
    }
    return alive > 0 ? { high: high / alive } : {};
  },
};

/**
 * Discharge: `dmg` from the psyker tagged `backlash`, or `ff` and `splash`. One backlash is the
 * set of such hits in one tick (a Discharge that hits nothing leaves no event, so it is not counted).
 */
export const psykerBacklash: MetricDef = {
  id: 'psyker.backlash',
  title: 'Psyker backlashes: count, damage dealt and the part that hit allies',
  unit: 'mixed',
  areas: ['psyker.backlash'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const seen = new Set<number>();
    let damage = 0;
    let ffDamage = 0;
    log.events.forEach((e, i) => {
      if (e.kind !== 'dmg' || ix.entities.get(e.src)?.def !== 'psyker') {
        return;
      }
      if (!(e.tags.includes('backlash') || (e.tags.includes('ff') && e.tags.includes('splash')))) {
        return;
      }
      seen.add(e.tick);
      damage += ix.effDamage[i] ?? 0;
      if (ix.entities.get(e.dst)?.team === 0) {
        ffDamage += ix.effDamage[i] ?? 0;
      }
    });
    return { count: seen.size, damage, ffDamage };
  },
};
