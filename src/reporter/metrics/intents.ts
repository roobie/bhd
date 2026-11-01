// Metrics 9, 10: intents. `combo.rate` is a proxy until real combos exist: intent `fulfil` events per
// kind per wave, with the payoff being the value of the fulfilling hero's latest cast.

import type { MetricDef } from '../types.ts';
import { buildIndex } from './gameindex.ts';

export const comboRate: MetricDef = {
  id: 'combo.rate',
  title: 'Intent fulfils per kind and wave (combo proxy), with fulfilling-cast payoff',
  unit: 'count',
  areas: ['intents'],
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const casts = new Map<number, { tick: number; value: number }[]>();
    for (const e of log.events) {
      if (e.kind === 'ability') {
        const list = casts.get(e.hero) ?? [];
        list.push({ tick: e.tick, value: e.value });
        casts.set(e.hero, list);
      }
    }
    const out: Record<string, number> = {};
    log.events.forEach((e, i) => {
      if (e.kind !== 'intent' || e.op !== 'fulfil') {
        return;
      }
      const key = `${e.intentKind}:w${ix.wave[i] ?? 0}`;
      out[key] = (out[key] ?? 0) + 1;
      const cast = casts.get(e.by)?.findLast((c) => c.tick <= e.tick);
      out[`${key}:payoff`] = (out[`${key}:payoff`] ?? 0) + (cast?.value ?? 0);
    });
    return out;
  },
};

export const intentFulfil: MetricDef = {
  id: 'intent.fulfil',
  title: 'Intents fulfilled per posted, by kind',
  unit: 'fraction',
  areas: ['intents'],
  missing: 'skip',
  compute: (log) => {
    const posts = new Map<string, number>();
    const fulfils = new Map<string, number>();
    for (const e of log.events) {
      if (e.kind === 'intent' && e.op === 'post') {
        posts.set(e.intentKind, (posts.get(e.intentKind) ?? 0) + 1);
      } else if (e.kind === 'intent' && e.op === 'fulfil') {
        fulfils.set(e.intentKind, (fulfils.get(e.intentKind) ?? 0) + 1);
      }
    }
    const out: Record<string, number> = {};
    for (const [kind, n] of posts) {
      out[kind] = (fulfils.get(kind) ?? 0) / n;
    }
    return out;
  },
};

export const intentLatency: MetricDef = {
  id: 'intent.latency',
  title: 'Mean ticks from post to fulfil, by kind',
  unit: 'ticks',
  areas: ['intents'],
  missing: 'skip',
  compute: (log) => {
    const posted = new Map<number, number>();
    const sum = new Map<string, { total: number; n: number }>();
    for (const e of log.events) {
      if (e.kind !== 'intent') {
        continue;
      }
      if (e.op === 'post') {
        posted.set(e.id, e.tick);
      } else if (e.op === 'fulfil') {
        const at = posted.get(e.id);
        if (at !== undefined) {
          const s = sum.get(e.intentKind) ?? { total: 0, n: 0 };
          s.total += e.tick - at;
          s.n += 1;
          sum.set(e.intentKind, s);
        }
      }
    }
    const out: Record<string, number> = {};
    for (const [kind, s] of sum) {
      out[kind] = s.total / s.n;
    }
    return out;
  },
};
