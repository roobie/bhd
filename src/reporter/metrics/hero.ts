// Metrics 4, 5, 6, 8, 13: per-hero deaths, damage share, friendly fire, ability use, ultimates.

import type { GameLog, MetricDef } from '../types.ts';
import { buildIndex, defOf } from './gameindex.ts';

/** Ultimate slot per kit (the gunner's Furnace Heart is slot 3); other heroes use their highest slot. */
const ULT_SLOT: Readonly<Record<string, number>> = { gunner: 3 };

/** The ultimate slot of a hero def: the kit table, else the highest ability slot it has, else 0. */
function ultSlot(game: GameLog['header']['resolved']['game'], def: string): number {
  const known = ULT_SLOT[def];
  if (known !== undefined) {
    return known;
  }
  const hero = game.heroes.find((h) => h.id === def);
  if (hero !== undefined && 'abilities' in hero) {
    return hero.abilities.reduce((m, a) => Math.max(m, a.slot), 0);
  }
  return 0;
}

export const heroDeaths: MetricDef = {
  id: 'hero.deaths',
  title: 'Hero deaths',
  unit: 'count',
  areas: ['hero'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = {};
    for (const h of ix.heroes) {
      out[h.def] = out[h.def] ?? 0;
    }
    for (const e of log.events) {
      if (e.kind === 'death' && ix.entities.get(e.id)?.isHero === true) {
        const def = defOf(ix, e.id);
        out[def] = (out[def] ?? 0) + 1;
      }
    }
    return out;
  },
};

export const heroDmgShare: MetricDef = {
  id: 'hero.dmgShare',
  title: 'Share of team damage to enemies',
  unit: 'fraction',
  areas: ['hero'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const dealt: Record<string, number> = {};
    for (const h of ix.heroes) {
      dealt[h.def] = 0;
    }
    let total = 0;
    log.events.forEach((e, i) => {
      if (e.kind !== 'dmg') {
        return;
      }
      const src = ix.entities.get(e.src);
      if (src?.isHero !== true || ix.entities.get(e.dst)?.team !== 1) {
        return;
      }
      const amount = ix.effDamage[i] ?? 0;
      dealt[src.def] = (dealt[src.def] ?? 0) + amount;
      total += amount;
    });
    const out: Record<string, number> = {};
    for (const [def, v] of Object.entries(dealt)) {
      out[def] = total > 0 ? v / total : 0;
    }
    return out;
  },
};

export const teamFf: MetricDef = {
  id: 'team.ff',
  title: 'Friendly-fire damage',
  unit: 'hp',
  areas: ['team.ff'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = {};
    log.events.forEach((e, i) => {
      if (e.kind !== 'dmg' || ix.entities.get(e.src)?.team !== 0 || ix.entities.get(e.dst)?.team !== 0) {
        return;
      }
      const key = `${defOf(ix, e.src)}>${defOf(ix, e.dst)}`;
      out[key] = (out[key] ?? 0) + (ix.effDamage[i] ?? 0);
    });
    return out;
  },
};

interface Cast {
  count: number;
  value: number;
}

function castsByKey(log: GameLog): Map<string, Cast> {
  const ix = buildIndex(log);
  const casts = new Map<string, Cast>();
  for (const e of log.events) {
    if (e.kind === 'ability') {
      const key = `${defOf(ix, e.hero)}:${e.slot}`;
      const c = casts.get(key) ?? { count: 0, value: 0 };
      c.count += 1;
      c.value += e.value;
      casts.set(key, c);
    }
  }
  return casts;
}

export const abilityCasts: MetricDef = {
  id: 'ability.casts',
  title: 'Ability casts',
  unit: 'count',
  areas: ['hero.ability'],
  missing: 'zero',
  compute: (log) => {
    const out: Record<string, number> = {};
    for (const [key, c] of castsByKey(log)) {
      out[key] = c.count;
    }
    return out;
  },
};

export const abilityValue: MetricDef = {
  id: 'ability.value',
  title: 'Mean value per ability cast',
  unit: 'value',
  areas: ['hero.ability'],
  missing: 'skip',
  compute: (log) => {
    const out: Record<string, number> = {};
    for (const [key, c] of castsByKey(log)) {
      out[key] = c.value / c.count;
    }
    return out;
  },
};

export const ultTiming: MetricDef = {
  id: 'ult.timing',
  title: 'Ultimate timing: wave, team hp and enemies alive at the first cast; cast count',
  unit: 'mixed',
  areas: ['hero.ult'],
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = {};
    const seen = new Set<string>();
    for (const h of ix.heroes) {
      out[`${h.def}:casts`] = 0;
    }
    log.events.forEach((e, i) => {
      if (e.kind !== 'ability') {
        return;
      }
      const hero = ix.entities.get(e.hero);
      if (hero === undefined || e.slot !== ultSlot(log.header.resolved.game, hero.def)) {
        return;
      }
      out[`${hero.def}:casts`] = (out[`${hero.def}:casts`] ?? 0) + 1;
      if (!seen.has(hero.def)) {
        seen.add(hero.def);
        out[`${hero.def}:wave`] = ix.wave[i] ?? 0;
        out[`${hero.def}:teamHp`] = ix.teamFrac[i] ?? 1;
        out[`${hero.def}:enemies`] = ix.enemiesAlive[i] ?? 0;
      }
    });
    return out;
  },
};
