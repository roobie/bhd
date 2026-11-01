// Metric 7: how long the gunner spends in each heat band.

import type { MetricDef } from '../types.ts';
import { buildIndex } from './gameindex.ts';

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
      const end = g.deathTick ?? ix.endTick;
      // A gunner starts in band 0; each `resource` heat event moves it to the new band.
      let band = 0;
      let at = g.spawnTick;
      for (const e of log.events) {
        if (e.kind === 'resource' && e.hero === g.id && e.resource === 'heat' && e.tick < end) {
          add(band, e.tick - at);
          ({ band } = e);
          at = Math.max(at, e.tick);
        }
      }
      add(band, end - at);
      alive += Math.max(0, end - g.spawnTick);
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
