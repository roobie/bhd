// perceive(sim, memory) -> Perception, and perceiveMaster(sim) -> MasterView. Run only inside
// Match, at most once per tick, on think ticks (memoised by tick as `match.perception`). Returns
// copied plain data, never sim objects. STUB (basic and working): the perception slice owns this
// file and fills in the semantics (see types.ts for each field's contract). Everything is derived
// in ascending id order, so the result is a pure function of the sim state and the memory.

import type { GunnerDef } from '../content/heroes/gunner.ts';
import type { StandinAbilityDef, StandinDef } from '../content/heroes/standins.ts';
import type { Point } from '../content/types.ts';
import { findById } from '../content/types.ts';
import type { Entity } from '../sim/entities.ts';
import { STANCE } from '../sim/heroes/gunner.ts';
import { unitsOnSegment } from '../sim/query.ts';
import type { Sim } from '../sim/sim.ts';
import { ticks } from '../sim/time.ts';
import { buildClumps } from './clumps.ts';
import { findComboWindows } from './combos.ts';
import type { PerceptionMemory } from './memory.ts';
import { heroThreat } from './threat.ts';
import type {
  AbilityView,
  AncientView,
  EnemyView,
  GunnerView,
  HeroView,
  IntentView,
  MasterView,
  Perception,
  ResourceView,
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

function standinAbility(ab: StandinAbilityDef, cooldownLeft: number): AbilityView {
  const range = ab.effect === 'mark' || ab.effect === 'pull' ? ab.range : 0;
  const radius = ab.effect === 'mark' ? 0 : ab.radius;
  return { slot: ab.slot, effect: ab.effect, ready: cooldownLeft === 0, cooldownLeft, range, radius };
}

function gunnerAbilities(def: GunnerDef, kit: Extract<NonNullable<Entity['kit']>, { kind: 'gunner' }>): AbilityView[] {
  const usable = kit.lockTicks === 0;
  const make = (slot: number, effect: string, cd: number, range: number): AbilityView => ({
    slot,
    effect,
    ready: cd === 0 && usable,
    cooldownLeft: cd,
    range,
    radius: 0,
  });
  return [
    { slot: 0, effect: 'brace', ready: kit.unbraceTicks === 0, cooldownLeft: kit.unbraceTicks, range: 0, radius: 0 },
    make(1, 'vent', kit.cdVent, def.vent.range),
    make(2, 'suppress', kit.cdSuppress, def.suppress.range),
    make(3, 'furnace', kit.cdFurnace, 0),
  ];
}

function lineAlliesOf(sim: Sim, hero: Readonly<Entity>, range: number, halfWidth: number): number[] {
  const target = sim.entities.get(hero.attack.target);
  if (target === undefined || target.hp <= 0) {
    return [];
  }
  const dx = target.x - hero.x;
  const dy = target.y - hero.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) {
    return [];
  }
  const to = { x: hero.x + (dx / len) * range, y: hero.y + (dy / len) * range };
  return unitsOnSegment(sim.entities, hero, to, halfWidth)
    .filter((h) => h.unit.kind === 'hero' && h.unit.id !== hero.id)
    .map((h) => h.unit.id)
    .sort((a, b) => a - b);
}

interface HeroParts {
  readonly kit: HeroView['kit'];
  readonly role: HeroView['role'];
  readonly resources: ResourceView[];
  readonly abilities: AbilityView[];
  readonly lineAllies: number[];
  readonly gunner?: GunnerView;
}

function heroParts(sim: Sim, e: Readonly<Entity>): HeroParts | undefined {
  const def = findById(sim.game.heroes, e.def);
  const { kit } = e;
  if (def?.kit === 'gunner' && kit?.kind === 'gunner') {
    const heat = kit.heat / 10_000;
    return {
      kit: 'gunner',
      role: 'gunner',
      resources: [{ name: 'heat', frac: heat, band: kit.heatBand }],
      abilities: gunnerAbilities(def, kit),
      lineAllies: lineAlliesOf(sim, e, def.attack.range, def.heat.lineHalfWidth),
      gunner: {
        heat,
        spin: kit.spin,
        braced: kit.stance === STANCE.braced,
        locked: kit.lockTicks > 0,
        furnaceActive: kit.furnaceTicks > 0,
      },
    };
  }
  if (def?.kit === 'standin' && kit?.kind === 'standin') {
    const d: StandinDef = def;
    return {
      kit: 'standin',
      role: d.role,
      resources: [],
      abilities: d.abilities.map((ab) => standinAbility(ab, kit.cooldowns[ab.slot] ?? 0)),
      lineAllies: [],
    };
  }
  return undefined;
}

function heroViews(sim: Sim, enemies: readonly EnemyView[], memory: PerceptionMemory): HeroView[] {
  const out: HeroView[] = [];
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
      resources: parts.resources,
      abilities: parts.abilities,
      statuses: statusesOf(e),
      dest: e.move.mode === 'point' ? { x: e.move.tx, y: e.move.ty } : undefined,
      target: e.attack.target,
      hold: e.kit.hold,
      lineAllies: parts.lineAllies,
      ...(parts.gunner === undefined ? {} : { gunner: parts.gunner }),
    };
    out.push(view);
  }
  return out.sort((a, b) => a.slot - b.slot || a.id - b.id);
}

function teamView(heroes: readonly HeroView[], memory: PerceptionMemory): TeamView {
  const hp = heroes.reduce((n, h) => n + h.hp, 0);
  const maxHp = heroes.reduce((n, h) => n + h.maxHp, 0);
  const ids = new Set(heroes.map((h) => h.id));
  const lost = memory.damage.reduce((n, s) => (ids.has(s.dst) ? n + s.amount : n), 0);
  return {
    hpFrac: frac(hp, maxHp),
    lowHeroes: heroes.filter((h) => h.hpFrac <= memory.cfg.lowHpFrac).length,
    damageFrac: maxHp > 0 ? lost / maxHp : 0,
    leaks: memory.leaks.length,
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
    enemies,
    clumps,
    comboWindows: findComboWindows(enemies, clumps),
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
    costs: def.costs.map((c) => ({ def: c.def, cost: c.cost })),
    sendAt: master.lastStart + ticks(def.minIntervalSeconds),
    nextAt: sim.waves.nextAt,
    wavesLeft: Math.max(0, sim.game.waves.waves.length - sim.waves.n),
  };
}
