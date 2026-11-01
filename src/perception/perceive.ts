// perceive(sim, memory) -> Perception, and perceiveMaster(sim) -> MasterView. Run only inside
// Match, at most once per tick, on think ticks (memoised by tick as `match.perception`). Returns
// copied plain data, never sim objects. STUB (basic and working): the perception slice owns this
// file and fills in the semantics (see types.ts for each field's contract). Everything is derived
// in ascending id order, so the result is a pure function of the sim state and the memory.

import type { Point } from '../content/types.ts';
import { findById } from '../content/types.ts';
import type { Entity } from '../sim/entities.ts';
import { isDowned, respawnLeft } from '../sim/respawn.ts';
import type { Sim } from '../sim/sim.ts';
import { ticks } from '../sim/time.ts';
import { buildClumps } from './clumps.ts';
import { findComboWindows } from './combos.ts';
import { gunnerParts } from './kits/gunner.ts';
import type { HeroParts } from './kits/parts.ts';
import { penitentParts } from './kits/penitent.ts';
import { psykerParts } from './kits/psyker.ts';
import { standinParts } from './kits/standin.ts';
import { damageByVictim, livesLost, type PerceptionMemory } from './memory.ts';
import { heroThreat } from './threat.ts';
import type {
  AncientView,
  EnemyView,
  FallenView,
  HeroView,
  IntentView,
  MasterView,
  Perception,
  StatusView,
  TeamView,
} from './types.ts';

function statusesOf(e: Readonly<Entity>): StatusView[] {
  return e.statuses.map((s) => ({ status: s.status, until: s.until, src: s.src, value: s.value }));
}

function frac(hp: number, maxHp: number): number {
  return maxHp > 0 ? Math.max(0, hp) / maxHp : 0;
}

/** Cumulative length of the lane up to each waypoint. */
function laneLengths(lane: readonly Point[]): number[] {
  const out = [0];
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1];
    const b = lane[i];
    const len =
      a !== undefined && b !== undefined ? Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)) : 0;
    out.push((out[i - 1] ?? 0) + len);
  }
  return out;
}

function laneProgress(e: Readonly<Entity>, lane: readonly Point[], lengths: readonly number[]): number {
  const prev = Math.max(0, Math.min(e.move.waypoint, lane.length) - 1);
  const at = lane[prev];
  if (at === undefined) {
    return 0;
  }
  const dx = e.x - at.x;
  const dy = e.y - at.y;
  return (lengths[prev] ?? 0) + Math.sqrt(dx * dx + dy * dy);
}

function enemyViews(sim: Sim): EnemyView[] {
  const { lane } = sim.game.map;
  const lengths = laneLengths(lane);
  const out: EnemyView[] = [];
  for (const e of sim.entities.values()) {
    if (e.kind !== 'enemy' || e.hp <= 0) {
      continue;
    }
    const def = findById(sim.game.enemies, e.def);
    const dps = def === undefined || def.attack.cooldown <= 0 ? 0 : def.attack.damage / def.attack.cooldown;
    out.push({
      id: e.id,
      def: e.def,
      x: e.x,
      y: e.y,
      hp: e.hp,
      hpFrac: frac(e.hp, e.maxHp),
      progress: laneProgress(e, lane, lengths),
      dps,
      target: e.attack.target,
      statuses: statusesOf(e),
    });
  }
  return out;
}

function heroParts(sim: Sim, e: Readonly<Entity>): HeroParts | undefined {
  const def = findById(sim.game.heroes, e.def);
  const { kit } = e;
  if (def?.kit === 'gunner' && kit?.kind === 'gunner') {
    return gunnerParts(sim, e, def, kit);
  }
  if (def?.kit === 'penitent' && kit?.kind === 'penitent') {
    return penitentParts(def, kit);
  }
  if (def?.kit === 'psyker' && kit?.kind === 'psyker') {
    return psykerParts(def, kit);
  }
  if (def?.kit === 'standin' && kit?.kind === 'standin') {
    return standinParts(def, kit);
  }
  return undefined;
}

function heroViews(sim: Sim, enemies: readonly EnemyView[], memory: PerceptionMemory): HeroView[] {
  const out: HeroView[] = [];
  const taken = damageByVictim(memory);
  for (const e of sim.entities.values()) {
    const parts = e.kind === 'hero' && e.hp > 0 ? heroParts(sim, e) : undefined;
    const slot = sim.game.heroes.findIndex((d) => d.id === e.def);
    if (parts === undefined || e.kit === undefined || slot < 0) {
      continue;
    }
    const view: HeroView = {
      id: e.id,
      slot,
      def: e.def,
      kit: parts.kit,
      role: parts.role,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      hpFrac: frac(e.hp, e.maxHp),
      threat: heroThreat(e, enemies, memory.cfg.threatRadius),
      recentDamage: e.maxHp > 0 ? (taken.get(e.id) ?? 0) / e.maxHp : 0,
      resources: parts.resources,
      abilities: parts.abilities,
      statuses: statusesOf(e),
      dest: e.move.mode === 'point' ? { x: e.move.tx, y: e.move.ty } : undefined,
      target: e.attack.target,
      hold: e.kit.hold,
      autocast: e.kit.autocast,
      lineAllies: parts.lineAllies,
      ...(parts.gunner === undefined ? {} : { gunner: parts.gunner }),
    };
    out.push(view);
  }
  return out.sort((a, b) => a.slot - b.slot || a.id - b.id);
}

/** Heroes that are down and waiting to respawn, by slot. */
function fallenViews(sim: Sim): FallenView[] {
  const out: FallenView[] = [];
  for (const e of sim.entities.values()) {
    if (isDowned(e)) {
      out.push({
        id: e.id,
        slot: sim.game.heroes.findIndex((d) => d.id === e.def),
        def: e.def,
        respawnTicks: respawnLeft(e, sim.tick),
      });
    }
  }
  return out.sort((a, b) => a.slot - b.slot || a.id - b.id);
}

function teamView(heroes: readonly HeroView[], memory: PerceptionMemory): TeamView {
  const hp = heroes.reduce((n, h) => n + h.hp, 0);
  const maxHp = heroes.reduce((n, h) => n + h.maxHp, 0);
  const ids = new Set(heroes.map((h) => h.id));
  let lost = 0;
  for (const [victim, amount] of damageByVictim(memory)) {
    lost += ids.has(victim) ? amount : 0;
  }
  return {
    hpFrac: frac(hp, maxHp),
    lowHeroes: heroes.filter((h) => h.hpFrac <= memory.cfg.lowHpFrac).length,
    damageFrac: maxHp > 0 ? lost / maxHp : 0,
    leaks: memory.leaks.length,
    livesLost: livesLost(memory),
  };
}

function ancientView(sim: Sim): AncientView {
  const a = [...sim.entities.values()].find((e) => e.kind === 'ancient');
  const { ancient } = sim.game.map;
  return {
    id: a?.id ?? 0,
    x: ancient.x,
    y: ancient.y,
    radius: ancient.radius,
    hp: Math.max(0, a?.hp ?? 0),
    hpFrac: frac(a?.hp ?? 0, a?.maxHp ?? ancient.maxHp),
  };
}

function intentViews(sim: Sim): IntentView[] {
  return sim.intents.live.map((i) => ({
    id: i.id,
    by: i.by,
    intentKind: i.intentKind,
    x: i.x,
    y: i.y,
    fireTick: i.fireTick,
    fired: i.fired,
    reservers: i.reservations.map((r) => r.hero).sort((a, b) => a - b),
  }));
}

export function perceive(sim: Sim, memory: PerceptionMemory): Perception {
  const enemies = enemyViews(sim);
  const heroes = heroViews(sim, enemies, memory);
  const clumps = buildClumps(enemies, memory.cfg.clumpRadius);
  const next = sim.game.waves.waves[sim.waves.n];
  return {
    tick: sim.tick,
    heroes,
    fallen: fallenViews(sim),
    enemies,
    clumps,
    comboWindows: findComboWindows(enemies, clumps, {
      statuses: memory.cfg.comboStatuses,
      minCount: memory.cfg.comboMinCount,
    }),
    ancient: ancientView(sim),
    wave: {
      n: sim.waves.n,
      total: sim.game.waves.waves.length,
      nextAt: sim.waves.nextAt,
      preview: sim.master === undefined ? (next?.spawns ?? []).map((g) => ({ def: g.def, count: g.count })) : [],
    },
    intents: intentViews(sim),
    team: teamView(heroes, memory),
  };
}

/** The Director's extra view; undefined in schedule mode. */
export function perceiveMaster(sim: Sim): MasterView | undefined {
  const { master } = sim;
  const def = sim.game.master;
  if (master === undefined || def === undefined) {
    return undefined;
  }
  return {
    budget: master.budget,
    pending: master.pending.map((g) => ({ def: g.def, count: g.count })),
    costs: def.costs.map((c) => ({ def: c.def, cost: c.cost, unlockWave: c.unlockWave ?? 1 })),
    sendAt: master.lastStart + ticks(def.minIntervalSeconds),
    nextAt: sim.waves.nextAt,
    wavesLeft: Math.max(0, sim.game.waves.waves.length - sim.waves.n),
  };
}
