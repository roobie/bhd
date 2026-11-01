// Metric 11: time-weighted choice spread. A pick counts from its `choice` event until the hero's next
// pick of that decision, the hero's death or the end of the game.

import type { MetricDef } from '../types.ts';
import { buildIndex, defOf } from './gameindex.ts';

interface Open {
  readonly hero: number;
  readonly decision: string;
  readonly tick: number;
  readonly picked: string;
}

function bump(map: Map<string, number>, key: string, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Share of each option within its decision; decisions with no time are left out. */
function shares(
  options: ReadonlyMap<string, ReadonlySet<string>>,
  time: ReadonlyMap<string, number>,
  total: ReadonlyMap<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [group, set] of options) {
    const t = total.get(group) ?? 0;
    for (const option of t > 0 ? set : []) {
      out[`${group}:${option}`] = (time.get(`${group}:${option}`) ?? 0) / t;
    }
  }
  return out;
}

export const choiceSpread: MetricDef = {
  id: 'choice.spread',
  title: 'Time share per bot decision option',
  unit: 'fraction',
  areas: ['hero.choice'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const open = new Map<string, Open>();
    const time = new Map<string, number>();
    const total = new Map<string, number>();
    const options = new Map<string, Set<string>>();
    const close = (cur: Open, until: number): void => {
      const group = `${defOf(ix, cur.hero)}:${cur.decision}`;
      const dt = Math.max(0, until - cur.tick);
      bump(time, `${group}:${cur.picked}`, dt);
      bump(total, group, dt);
    };
    for (const e of log.events) {
      if (e.kind !== 'choice') {
        continue;
      }
      const group = `${defOf(ix, e.hero)}:${e.decision}`;
      options.set(group, new Set([...(options.get(group) ?? []), ...e.options.map((o) => o.id)]));
      const k = `${e.hero}|${e.decision}`;
      const prev = open.get(k);
      if (prev !== undefined) {
        close(prev, e.tick);
      }
      open.set(k, { hero: e.hero, decision: e.decision, tick: e.tick, picked: e.picked });
    }
    for (const cur of open.values()) {
      close(cur, ix.entities.get(cur.hero)?.deathTick ?? ix.endTick);
    }
    return shares(options, time, total);
  },
};
