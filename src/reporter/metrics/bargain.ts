// Bargain metrics (wave 9): offers and their outcomes per bargain id, the Ancient heals bargains
// cause, wave extras, and the costs attributed to accepted bargains. Built from `bargain` events
// plus the existing ones. Anything that is an estimate says so in its title and in docs/METRICS.md.

import type { Effect } from '../../content/bargains.ts';
import type { SimEvent } from '../../sim/events.ts';
import type { GameLog, MetricDef } from '../types.ts';
import { buildIndex } from './gameindex.ts';

interface Offer {
  readonly id: number;
  readonly wave: number;
  readonly cards: readonly string[];
  /** Resolution op; undefined while the offer was still open at the end of the game. */
  op: 'accept' | 'decline' | 'expire' | undefined;
  card: string | undefined;
}

interface Accept {
  readonly card: string;
  readonly tick: number;
}

interface Bargains {
  readonly offers: readonly Offer[];
  readonly accepts: readonly Accept[];
}

type BargainEvent = Extract<SimEvent, { kind: 'bargain' }>;

function resolve(o: Offer, e: BargainEvent): boolean {
  if (o.op !== undefined || (e.op !== 'accept' && e.op !== 'decline' && e.op !== 'expire')) {
    return false;
  }
  o.op = e.op;
  o.card = e.card;
  return e.op === 'accept' && e.card !== undefined;
}

function scan(events: readonly SimEvent[]): Bargains {
  const byId = new Map<number, Offer>();
  const accepts: Accept[] = [];
  for (const e of events) {
    // An `expire` that carries a `card` is a timed bargain ending, not an offer window lapsing.
    if (e.kind !== 'bargain' || (e.op === 'expire' && e.card !== undefined)) {
      continue;
    }
    const o = byId.get(e.offer);
    if (e.op === 'offer') {
      byId.set(e.offer, { id: e.offer, wave: e.wave ?? 0, cards: e.cards ?? [], op: undefined, card: undefined });
    } else if (o !== undefined && resolve(o, e) && e.card !== undefined) {
      accepts.push({ card: e.card, tick: e.tick });
    }
  }
  return { offers: [...byId.values()], accepts };
}

/** Offers that were resolved (accept, decline or expire) before the game ended. */
function resolved(b: Bargains): Offer[] {
  return b.offers.filter((o) => o.op !== undefined);
}

/** Series keys that are not bargain ids (they get the bare `bargain` area). */
const PLAIN = /^(?:all|none|any|total|w\d+|accepted|declined)(?::|$)/u;

function bargainAreas(key: string): readonly string[] {
  if (PLAIN.test(key)) {
    return ['bargain'];
  }
  const [id = key] = key.split(':');
  return [`bargain.${id}`];
}

export const bargainAccept: MetricDef = {
  id: 'bargain.accept',
  title: 'Accept rate per bargain id: accepts / times it was on a resolved offer',
  unit: 'fraction',
  areas: [],
  areasOf: bargainAreas,
  missing: 'skip',
  compute: (log) => {
    const shown = new Map<string, number>();
    const taken = new Map<string, number>();
    for (const o of resolved(scan(log.events))) {
      for (const c of new Set(o.cards)) {
        shown.set(c, (shown.get(c) ?? 0) + 1);
      }
      if (o.op === 'accept' && o.card !== undefined) {
        taken.set(o.card, (taken.get(o.card) ?? 0) + 1);
      }
    }
    const out: Record<string, number> = {};
    for (const [c, n] of shown) {
      out[c] = (taken.get(c) ?? 0) / n;
    }
    return out;
  },
};

/** Share of resolved offers that ended with `op`, over the game (`all`) and per offer wave. */
function share(op: 'decline' | 'expire'): (log: GameLog) => Record<string, number> {
  return (log) => {
    const out: Record<string, number> = {};
    const per = new Map<number, { n: number; hit: number }>();
    let n = 0;
    let hit = 0;
    for (const o of resolved(scan(log.events))) {
      const w = per.get(o.wave) ?? { n: 0, hit: 0 };
      per.set(o.wave, w);
      w.n += 1;
      n += 1;
      if (o.op === op) {
        w.hit += 1;
        hit += 1;
      }
    }
    if (n > 0) {
      out.all = hit / n;
    }
    for (const [wave, w] of per) {
      out[`w${wave}`] = w.hit / w.n;
    }
    return out;
  };
}

export const bargainDecline: MetricDef = {
  id: 'bargain.decline',
  title: 'Share of resolved offers declined by command',
  unit: 'fraction',
  areas: ['bargain'],
  missing: 'skip',
  compute: share('decline'),
};

export const bargainExpire: MetricDef = {
  id: 'bargain.expire',
  title: 'Share of resolved offers that lapsed unresolved',
  unit: 'fraction',
  areas: ['bargain'],
  missing: 'skip',
  compute: share('expire'),
};

/** Tick -> `accept` or `decline` (an expiry counts as one) of the resolutions; the sim heals the Ancient (src 0) in that tick. */
function resolutionTicks(events: readonly SimEvent[]): Map<number, string> {
  const ops = new Map<number, string>();
  for (const e of events) {
    if (
      e.kind === 'bargain' &&
      (e.op === 'accept' || e.op === 'decline' || (e.op === 'expire' && e.card === undefined))
    ) {
      ops.set(e.tick, e.op === 'accept' ? 'accept' : 'decline');
    }
  }
  return ops;
}

export const bargainAncientHealed: MetricDef = {
  id: 'bargain.ancientHealed',
  title: 'Ancient hp healed by bargains: from declines / expiries, from accepted cards (e.g. Blood Tithe), other',
  unit: 'hp',
  areas: ['bargain', 'outcome'],
  missing: 'zero',
  compute: (log) => {
    const ix = buildIndex(log);
    const out: Record<string, number> = { decline: 0, accept: 0, other: 0 };
    const ops = resolutionTicks(log.events);
    for (const e of log.events) {
      if (e.kind === 'heal' && e.dst === ix.ancientId && e.amount > 0) {
        const key = e.src === 0 ? (ops.get(e.tick) ?? 'other') : 'other';
        out[key] = (out[key] ?? 0) + e.amount;
      }
    }
    out.total = (out.decline ?? 0) + (out.accept ?? 0) + (out.other ?? 0);
    return out;
  },
};

interface Extra {
  readonly def: string;
  readonly count: number;
}

function waveExtraEffects(log: GameLog, card: string): readonly Extra[] {
  const def = log.header.resolved.game.bargains?.pool.find((b) => b.id === card);
  const effects: readonly Effect[] = def === undefined ? [] : [...def.gains, ...def.costs];
  return effects.flatMap((f): Extra[] => (f.kind === 'waveExtra' ? [{ def: f.def, count: f.count }] : []));
}

export const bargainExtras: MetricDef = {
  id: 'bargain.extras',
  title:
    'ESTIMATE: wave extras spawned per enemy def: the waveExtra counts of accepted cards, for every wave started after the accept (permanent cards, schedule mode)',
  unit: 'count',
  areas: ['bargain'],
  missing: 'zero',
  compute: (log) => {
    const { accepts } = scan(log.events);
    const out: Record<string, number> = {};
    for (const e of log.events) {
      if (e.kind !== 'wave' || e.phase !== 'start') {
        continue;
      }
      for (const a of accepts) {
        if (a.tick > e.tick) {
          continue;
        }
        for (const x of waveExtraEffects(log, a.card)) {
          out[x.def] = (out[x.def] ?? 0) + x.count;
        }
      }
    }
    return out;
  },
};

/** First accept tick per bargain id. */
function firstAccepts(b: Bargains): Map<string, number> {
  const first = new Map<string, number>();
  for (const a of b.accepts) {
    first.set(a.card, Math.min(first.get(a.card) ?? Number.POSITIVE_INFINITY, a.tick));
  }
  return first;
}

export const bargainFf: MetricDef = {
  id: 'bargain.ff',
  title:
    'ESTIMATE: friendly-fire hp per 1000 ticks after the bargain was accepted (`none`: before any accept). Concurrent bargains each get the full rate; not causal',
  unit: 'hp/kt',
  areas: [],
  areasOf: bargainAreas,
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const first = firstAccepts(scan(log.events));
    if (first.size === 0) {
      return {};
    }
    const firstAny = Math.min(...first.values());
    const hp = new Map<string, number>();
    log.events.forEach((e, i) => {
      if (e.kind !== 'dmg' || ix.entities.get(e.src)?.team !== 0 || ix.entities.get(e.dst)?.team !== 0) {
        return;
      }
      const eff = ix.effDamage[i] ?? 0;
      const add = (k: string): void => {
        hp.set(k, (hp.get(k) ?? 0) + eff);
      };
      if (e.tick < firstAny) {
        add('none');
      }
      for (const [id, t] of first) {
        if (e.tick >= t) {
          add(id);
        }
      }
    });
    const out: Record<string, number> = {};
    const kt = (from: number, to: number): number => Math.max(1, to - from) / 1000;
    if (firstAny > 0) {
      out.none = (hp.get('none') ?? 0) / kt(0, firstAny);
    }
    for (const [id, t] of first) {
      out[id] = (hp.get(id) ?? 0) / kt(t, ix.endTick);
    }
    return out;
  },
};

export const bargainRespawn: MetricDef = {
  id: 'bargain.respawn',
  title:
    'ESTIMATE: mean ticks from death to respawn for downs that began after the bargain was accepted (`none`: before any accept). Completed downs only; not causal',
  unit: 'ticks',
  areas: [],
  areasOf: bargainAreas,
  missing: 'skip',
  compute: (log) => {
    const ix = buildIndex(log);
    const first = firstAccepts(scan(log.events));
    if (first.size === 0) {
      return {};
    }
    const firstAny = Math.min(...first.values());
    const sums = new Map<string, { sum: number; n: number }>();
    const add = (k: string, v: number): void => {
      const s = sums.get(k) ?? { sum: 0, n: 0 };
      sums.set(k, s);
      s.sum += v;
      s.n += 1;
    };
    const downs = ix.heroes.flatMap((h) => h.downs.filter((d) => d.to !== undefined));
    for (const d of downs) {
      const len = (d.to ?? d.from) - d.from;
      if (d.from < firstAny) {
        add('none', len);
      }
      for (const [id, t] of first) {
        if (d.from >= t) {
          add(id, len);
        }
      }
    }
    const out: Record<string, number> = {};
    for (const [k, s] of sums) {
      out[k] = s.sum / s.n;
    }
    return out;
  },
};

export const bargainAny: MetricDef = {
  id: 'bargain.any',
  title: '1 when the game accepted at least one bargain, 0 when offers happened but none was accepted (mean = share)',
  unit: 'fraction',
  areas: ['bargain', 'outcome'],
  missing: 'skip',
  compute: (log) => {
    const b = scan(log.events);
    return b.offers.length === 0 ? {} : { '': b.accepts.length > 0 ? 1 : 0 };
  },
};

export const bargainOutcome: MetricDef = {
  id: 'bargain.outcome',
  title:
    'Outcome split by "accepted at least one": waves started and final Ancient hp fraction, under the key of the group the game belongs to; compare the group means',
  unit: 'mixed',
  areas: ['bargain', 'outcome'],
  missing: 'skip',
  compute: (log) => {
    const b = scan(log.events);
    if (b.offers.length === 0) {
      return {};
    }
    const ix = buildIndex(log);
    const g = b.accepts.length > 0 ? 'accepted' : 'declined';
    return {
      [`${g}:wave`]: log.header.end.wave,
      [`${g}:ancientHp`]: ix.ancientFrac[log.events.length - 1] ?? 1,
    };
  },
};

/**
 * The invariant "the Ancient loses hp only through `leak` damage" (D-2PNKLSQWVJEBSWPI): every
 * violation found in a game log, as text. Checks the events (a `dmg` to the Ancient without the
 * `leak` tag) and the hp tracker (the Ancient's hp fraction falling at an event that is not a
 * tagged leak `dmg`). Empty when the invariant holds.
 */
export function ancientViolations(log: GameLog): string[] {
  const ix = buildIndex(log);
  const out: string[] = [];
  let prev = 1;
  log.events.forEach((e, i) => {
    const frac = ix.ancientFrac[i] ?? 1;
    const toAncient = e.kind === 'dmg' && e.dst === ix.ancientId;
    const leak = toAncient && e.tags.includes('leak');
    if (toAncient && e.amount > 0 && !leak) {
      out.push(`tick ${e.tick}: Ancient took ${e.amount} non-leak damage (tags: ${e.tags.join(',') || 'none'})`);
    } else if (frac < prev && !leak) {
      out.push(`tick ${e.tick}: Ancient hp fraction fell ${prev} -> ${frac} on a '${e.kind}' event`);
    }
    prev = frac;
  });
  return out;
}

export const bargainAncientViolations: MetricDef = {
  id: 'bargain.ancientViolations',
  title: 'Violations of "Ancient hp drops only through leak damage" (expected 0)',
  unit: 'count',
  areas: ['bargain', 'outcome'],
  missing: 'zero',
  compute: (log) => ({ '': ancientViolations(log).length }),
};
