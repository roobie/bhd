// Metric 7: how long the gunner spends in each heat band. Metric 7b: Pavise casts and blocks.

import type { MetricDef } from '../types.ts';
import { aliveSpans, buildIndex, overlap } from './gameindex.ts';

const BANDS = [0, 60, 85, 100] as const;

export const gunnerHeatBand: MetricDef = {
  id: 'gunner.heat.band',
  title: 'Gunner alive time per heat band',
  unit: 'fraction',
  areas: ['gunner.heat'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const time = new Map<number, number>();
    const add = (band: number, ticks: number): void => {
      time.set(band, (time.get(band) ?? 0) + Math.max(0, ticks));
    };
    let alive = 0;
    for (const g of ix.heroes.filter((h) => h.def === 'gunner')) {
      // Time counts only while up (a downed gunner is in no band). A gunner starts in band 0; each
      // `resource` heat event moves it to the new band and the band carries across a down.
      const spans = aliveSpans(ix, g);
      let band = 0;
      let at = g.spawnTick;
      for (const e of log.events) {
        if (e.kind === 'resource' && e.hero === g.id && e.resource === 'heat') {
          add(band, overlap(spans, at, e.tick));
          ({ band } = e);
          at = Math.max(at, e.tick);
        }
      }
      add(band, overlap(spans, at, ix.endTick));
      alive += overlap(spans, g.spawnTick, ix.endTick);
    }
    if (alive <= 0) {
      return {};
    }
    const out: Record<string, number> = {};
    for (const b of BANDS) {
      out[`b${b}`] = (time.get(b) ?? 0) / alive;
    }
    return out;
  },
};

/** The Pavise ability slot (the gunner's slot 2; content carries no slot table, see hero.ts). */
const PAVISE_SLOT = 2;

/**
 * A `block` event as the lead will add it at integration (not in `SimEvent` yet): `src` the attacker,
 * `dst` the protected target (may be omitted), `prop` the barrier entity id. Read structurally so
 * this compiles before the event type exists.
 */
interface BlockLike {
  readonly kind: 'block';
  readonly src: number;
  readonly dst?: number;
  readonly prop: number;
}

function isBlock(e: { readonly kind: string }): e is BlockLike {
  return e.kind === 'block';
}

/**
 * Metric 7b: Pavise casts (`ability` events of the gunner in the Pavise slot) and blocks (`block`
 * events). `blocks` reads 0 until the sim emits `block`; assumption recorded in docs/METRICS.md.
 */
export const gunnerPavise: MetricDef = {
  id: 'gunner.pavise',
  title: 'Pavise casts and blocked hits',
  unit: 'count',
  areas: ['gunner.pavise'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    let casts = 0;
    let blocks = 0;
    for (const e of log.events) {
      if (e.kind === 'ability' && e.slot === PAVISE_SLOT && ix.entities.get(e.hero)?.def === 'gunner') {
        casts += 1;
      } else if (isBlock(e)) {
        blocks += 1;
      }
    }
    return { casts, blocks };
  },
};
