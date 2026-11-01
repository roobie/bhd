// Payoff detection (DESIGN pillar 2): a pure fold over sim events that finds the moments a combo
// pays off. Owner: w8-feedback. Shared by the client feedback layer and (later) the reporter.
//
//  - cash-in: a status applied by hero X is cashed by a different hero Y. Marked: consumed by Y's
//    hit (status off and a dmg in the same tick). Exposed: the first hit by Y on a target that
//    carries X's Exposed. Clumped: an area-tagged hit by Y on a target that carries X's Clumped;
//    one payoff per (tick, status, X, Y), `count` is the targets hit.
//  - wombo: a `pull` intent fires and at least `minFulfils` reservations on it are fulfilled within
//    `womboWindowTicks` of the fire.
//
// Field names are stable: add, don't rename. Reads only event fields documented in sim/events.ts.

import type { SimEvent } from '../sim/events.ts';

export interface Payoff {
  readonly kind: 'cashin' | 'wombo';
  readonly tick: number;
  /** cashin: the status; wombo: the pull intent kind. */
  readonly label: string;
  /** cashin: the hero that applied the status. wombo: the poster of the pull. */
  readonly applier: number;
  /** cashin: the hero that cashed it. wombo: the hero whose fulfilment completed the wombo. */
  readonly casher: number;
  /** cashin: the first target hit (look its position up in a snapshot); wombo: 0. */
  readonly target: number;
  /** cashin: targets hit this tick; wombo: reservations fulfilled so far (>= minFulfils). */
  readonly count: number;
  /** wombo: the intent id; cashin: 0. */
  readonly intentId: number;
}

export interface PayoffRules {
  readonly marked: string;
  readonly exposed: string;
  readonly clumped: string;
  readonly areaTags: readonly string[];
  readonly pullKinds: readonly string[];
  readonly minFulfils: number;
  readonly womboWindowTicks: number;
}

const DEFAULT_PAYOFF_RULES: PayoffRules = {
  marked: 'marked',
  exposed: 'exposed',
  clumped: 'clumped',
  areaTags: ['line', 'cone', 'splash'],
  pullKinds: ['pull'],
  minFulfils: 2,
  womboWindowTicks: 90,
};

export interface PayoffTracker {
  /** Feeds events of whole ticks (a tick must not be split across calls); returns payoffs found. */
  push: (events: readonly SimEvent[]) => Payoff[];
}

interface Pull {
  readonly firedAt: number;
  readonly by: number;
  readonly intentKind: string;
  fulfils: number;
  done: boolean;
}

interface Hit {
  readonly src: number;
  readonly dst: number;
  readonly tags: readonly string[];
}

interface Group {
  readonly applier: number;
  readonly casher: number;
  readonly status: string;
  readonly targets: number[];
}

type IntentEv = Extract<SimEvent, { kind: 'intent' }>;

interface State {
  readonly rules: PayoffRules;
  /** target -> status -> appliers whose application has not paid out (Exposed) or ended yet. */
  readonly carried: Map<number, Map<string, Set<number>>>;
  readonly team: Map<number, number>;
  readonly pulls: Map<number, Pull>;
}

function sorted(set: ReadonlySet<number>): number[] {
  return [...set].sort((a, b) => a - b);
}

function openSet(st: State, id: number, status: string): Set<number> {
  let byStatus = st.carried.get(id);
  if (byStatus === undefined) {
    byStatus = new Map();
    st.carried.set(id, byStatus);
  }
  let s = byStatus.get(status);
  if (s === undefined) {
    s = new Set();
    byStatus.set(status, s);
  }
  return s;
}

/** A hero hit on an enemy, as far as the stream shows (an unseen team is given the benefit). */
function credible(st: State, h: Hit): boolean {
  return h.src !== 0 && !h.tags.includes('ff') && !h.tags.includes('leak') && (st.team.get(h.dst) ?? 1) !== 0;
}

class Groups {
  private readonly map = new Map<string, Group>();

  add(status: string, applier: number, casher: number, target: number): void {
    const key = `${status}|${applier}|${casher}`;
    const g = this.map.get(key) ?? { applier, casher, status, targets: [] };
    if (!g.targets.includes(target)) {
      g.targets.push(target);
    }
    this.map.set(key, g);
  }

  payoffs(tick: number): Payoff[] {
    return [...this.map.values()].map((g) => ({
      kind: 'cashin',
      tick,
      label: g.status,
      applier: g.applier,
      casher: g.casher,
      target: g.targets[0] ?? 0,
      count: g.targets.length,
      intentId: 0,
    }));
  }
}

function cashHit(st: State, h: Hit, groups: Groups): void {
  const { rules } = st;
  const isArea = h.tags.some((t) => rules.areaTags.includes(t));
  for (const status of isArea ? [rules.exposed, rules.clumped] : [rules.exposed]) {
    const appliers = st.carried.get(h.dst)?.get(status);
    for (const applier of sorted(appliers ?? new Set<number>())) {
      if (applier === h.src || applier === 0) {
        continue;
      }
      groups.add(status, applier, h.src, h.dst);
      if (status === rules.exposed) {
        // Exposed pays once per application; Clumped keeps paying for further area hits.
        appliers?.delete(applier);
      }
    }
  }
}

function resolveTick(st: State, tick: number, events: readonly SimEvent[]): Payoff[] {
  const hits: Hit[] = [];
  const consumed: { dst: number; src: number }[] = [];
  for (const ev of events) {
    if (ev.kind === 'dmg') {
      hits.push({ src: ev.src, dst: ev.dst, tags: ev.tags });
    } else if (ev.kind === 'status' && ev.status === st.rules.marked && !ev.on) {
      consumed.push({ dst: ev.dst, src: ev.src });
    }
  }
  const groups = new Groups();
  for (const c of consumed) {
    const hit = hits.find((h) => h.dst === c.dst && credible(st, h) && h.src !== c.src);
    if (hit !== undefined) {
      groups.add(st.rules.marked, c.src, hit.src, c.dst);
    }
  }
  for (const h of hits.filter((x) => credible(st, x))) {
    cashHit(st, h, groups);
  }
  return groups.payoffs(tick);
}

function trackIntent(st: State, ev: IntentEv): Payoff[] {
  const { rules } = st;
  if (!rules.pullKinds.includes(ev.intentKind)) {
    return [];
  }
  if (ev.op === 'fire') {
    st.pulls.set(ev.id, { firedAt: ev.tick, by: ev.by, intentKind: ev.intentKind, fulfils: 0, done: false });
    return [];
  }
  const pull = st.pulls.get(ev.id);
  if (pull === undefined || ev.op !== 'fulfil' || pull.done || ev.tick - pull.firedAt > rules.womboWindowTicks) {
    return [];
  }
  pull.fulfils += 1;
  if (pull.fulfils < rules.minFulfils) {
    return [];
  }
  pull.done = true;
  return [
    {
      kind: 'wombo',
      tick: ev.tick,
      label: pull.intentKind,
      applier: pull.by,
      casher: ev.by,
      target: 0,
      count: pull.fulfils,
      intentId: ev.id,
    },
  ];
}

function track(st: State, ev: SimEvent): Payoff[] {
  switch (ev.kind) {
    case 'spawn':
      st.team.set(ev.id, ev.team);
      return [];
    case 'status':
      if (ev.on) {
        openSet(st, ev.dst, ev.status).add(ev.src);
      } else {
        st.carried.get(ev.dst)?.get(ev.status)?.delete(ev.src);
      }
      return [];
    case 'death':
      st.carried.delete(ev.id);
      return [];
    case 'intent':
      return trackIntent(st, ev);
    default:
      return [];
  }
}

function pushTick(st: State, tick: number, events: readonly SimEvent[]): Payoff[] {
  // Hits resolve against statuses carried BEFORE this tick's applications.
  const out = resolveTick(st, tick, events);
  for (const ev of events) {
    out.push(...track(st, ev));
  }
  for (const [id, p] of st.pulls) {
    if (tick - p.firedAt > st.rules.womboWindowTicks) {
      st.pulls.delete(id);
    }
  }
  return out;
}

/** Splits an event list into runs of equal `tick`. */
function byTick(events: readonly SimEvent[]): (readonly SimEvent[])[] {
  const runs: SimEvent[][] = [];
  for (const ev of events) {
    const run = runs.at(-1);
    if (run !== undefined && run[0]?.tick === ev.tick) {
      run.push(ev);
    } else {
      runs.push([ev]);
    }
  }
  return runs;
}

export function createPayoffTracker(rules: PayoffRules = DEFAULT_PAYOFF_RULES): PayoffTracker {
  const st: State = { rules, carried: new Map(), team: new Map(), pulls: new Map() };
  return {
    push: (events) => byTick(events).flatMap((run) => pushTick(st, run[0]?.tick ?? 0, run)),
  };
}

/** Pure fold: every payoff in a whole event stream (a replay or a recorded game), in tick order. */
export function foldPayoffs(events: readonly SimEvent[], rules: PayoffRules = DEFAULT_PAYOFF_RULES): Payoff[] {
  return createPayoffTracker(rules).push(events);
}
