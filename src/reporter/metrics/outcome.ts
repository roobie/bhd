// Metrics 1, 2, 3, 12: how the game ended and how the Ancient and the team fared per wave.

import type { MetricDef } from '../types.ts';
import { buildIndex } from './gameindex.ts';

export const outcomeWave: MetricDef = {
  id: 'outcome.wave',
  title: 'Waves started',
  unit: 'waves',
  areas: ['outcome'],
  missing: 'zero',
  compute: (log) => ({ '': log.header.end.wave }),
};

export const outcomeLeaks: MetricDef = {
  id: 'outcome.leaks',
  title: 'Leaks per wave',
  unit: 'count',
  areas: ['outcome'],
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = {};
    log.events.forEach((e, i) => {
      if (e.kind === 'wave' && e.phase === 'start') {
        out[`w${e.n}`] = 0;
      } else if (e.kind === 'leak') {
        const key = `w${ix.wave[i] ?? 0}`;
        out[key] = (out[key] ?? 0) + 1;
      }
    });
    return out;
  },
};

export const outcomeAncientHp: MetricDef = {
  id: 'outcome.ancientHp',
  title: 'Ancient hp at wave start and at the end',
  unit: 'fraction',
  areas: ['outcome'],
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = {};
    log.events.forEach((e, i) => {
      if (e.kind === 'wave' && e.phase === 'start') {
        out[`w${e.n}`] = ix.ancientFrac[i] ?? 1;
      }
    });
    out.end = ix.ancientFrac[log.events.length - 1] ?? 1;
    return out;
  },
};

export const teamLowestHp: MetricDef = {
  id: 'team.lowestHp',
  title: 'Lowest team hp fraction',
  unit: 'fraction',
  areas: ['team', 'outcome'],
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = {};
    let game = 1;
    log.events.forEach((_, i) => {
      const frac = ix.teamFrac[i] ?? 1;
      const w = ix.wave[i] ?? 0;
      game = Math.min(game, frac);
      if (w > 0) {
        const key = `w${w}`;
        out[key] = Math.min(out[key] ?? 1, frac);
      }
    });
    out.game = game;
    return out;
  },
};
