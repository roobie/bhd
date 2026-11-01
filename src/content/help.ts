// Help text for the help overlay (H / "?"): one entry per ability effect and status id. Pure data
// plus a template filler; never hashed, the sim never reads it. Descriptions are TEMPLATES whose
// `{name}` placeholders are filled from content data (the hero def, the status defs) and from the
// perception ability view (cooldown, range, radius) at render time, so tuning a number can never
// make the help lie. No gameplay number is typed into prose here. A status's numbers come from
// whatever the sim reads: the status def for suppressed, but for marked, clumped and taunted the
// value and duration of the one ability that applies it (standins.ts passes its own); when none or
// several differing abilities apply it the text drops the numbers. A status nothing applies (today:
// suppressed, B-66KHQJCD5D4IJTCN) has no entry and is not listed. An id without an entry gets no
// description (the card still shows what perception and presentation know). The text describes what
// the sim does today (src/sim/heroes/*, combat.ts, statuses.ts); change both together.

import type { GunnerDef } from './heroes/gunner.ts';
import type { PenitentDef } from './heroes/penitent.ts';
import type { PsykerDef } from './heroes/psyker.ts';
import type { StandinAbilityDef } from './heroes/standins.ts';
import type { HeroDef } from './index.ts';
import { type Targeting, UI_TEXT } from './presentation.ts';
import type { RulesDef } from './rules.ts';
import type { StatusDef } from './types.ts';

type Values = Readonly<Record<string, number | undefined>>;

/** What an ability template may read (the card itself shows cooldown, range and radius from perception). */
export interface AbilityFacts {
  /** The casting hero's definition, when the shell has the game config. */
  readonly def: HeroDef | undefined;
  readonly statuses: readonly StatusDef[];
}

interface AbilityHelp {
  readonly effect: string;
  /** Template with `{name}` placeholders. */
  readonly text: string;
  /** Resource cost or side effect, a template; absent means free. */
  readonly cost?: string;
  /** A toggle: it has no cooldown to show. */
  readonly toggle?: boolean;
  readonly values: (f: AbilityFacts) => Values;
}

interface StatusHelp {
  readonly id: string;
  readonly text: string;
  /** The ability effect whose own value and duration the sim applies this status with. */
  readonly appliedBy?: StandinAbilityDef['effect'];
  /** Used instead of `text` when `appliedBy` finds no single source: no numbers. */
  readonly bare?: string;
  readonly values: (def: StatusDef | undefined, f: StatusFacts) => Values;
}

/** What a status template may read. */
export interface StatusFacts {
  readonly statuses: readonly StatusDef[];
  readonly heroes: readonly HeroDef[];
}

function gunnerOf(f: AbilityFacts): GunnerDef | undefined {
  return f.def?.kit === 'gunner' ? f.def : undefined;
}

function penitentOf(f: AbilityFacts): PenitentDef | undefined {
  return f.def?.kit === 'penitent' ? f.def : undefined;
}

function psykerOf(f: AbilityFacts): PsykerDef | undefined {
  return f.def?.kit === 'psyker' ? f.def : undefined;
}

function penitentIn(heroes: readonly HeroDef[]): PenitentDef | undefined {
  return heroes.find((h): h is PenitentDef => h.kit === 'penitent');
}

function psykerIn(heroes: readonly HeroDef[]): PsykerDef | undefined {
  return heroes.find((h): h is PsykerDef => h.kit === 'psyker');
}

function standinOf<E extends StandinAbilityDef['effect']>(
  f: AbilityFacts,
  effect: E,
): Extract<StandinAbilityDef, { effect: E }> | undefined {
  if (f.def?.kit !== 'standin') {
    return undefined;
  }
  const found = f.def.abilities.find((a) => a.effect === effect);
  return found as Extract<StandinAbilityDef, { effect: E }> | undefined;
}

/** A fraction as a percentage, rounded to one decimal so float noise (0.07 * 100) shows as "7". */
const percent = (fraction: number | undefined): number | undefined =>
  fraction === undefined ? undefined : Math.round(fraction * 1000) / 10;

const ABILITY_HELP: readonly AbilityHelp[] = [
  {
    effect: 'brace',
    toggle: true,
    text: 'Plant the Gunner facing the aimed direction. While braced she is rooted and fires only inside a {arc} degree arc, but gains +{range}% attack range and her spin never decays. Cast again to unbrace: she stays rooted and cannot fire for {unbrace}s.',
    values: (f) => {
      const g = gunnerOf(f);
      return {
        arc: g?.brace.arcDegrees,
        range: percent(g?.brace.rangeBonus),
        unbrace: g?.brace.unbraceSeconds,
      };
    },
  },
  {
    effect: 'vent',
    text: 'Dump all heat as a blast in a {cone} degree cone out to {range} range. Damage scales with the heat dumped, up to {max} at full heat. Heat and spin drop to zero. Does nothing with no heat, and cannot be used while locked out.',
    cost: 'All current heat',
    values: (f) => {
      const g = gunnerOf(f);
      return { cone: g?.vent.coneDegrees, range: g?.vent.range, max: g?.vent.maxDamage };
    },
  },
  {
    effect: 'pavise',
    text: 'Plant a {width} wide barrier up to {range} away for {duration}s. Enemy attacks across it are blocked, and so is your own line of fire, friendly fire included. Cannot be used while locked out.',
    values: (f) => {
      const g = gunnerOf(f);
      return {
        width: g === undefined ? undefined : g.pavise.halfLength * 2,
        range: g?.pavise.range,
        duration: g?.pavise.seconds,
      };
    },
  },
  {
    effect: 'chain',
    text: 'Haul the chain taut: every enemy within {radius} is Taunted for {duration}s and left Exposed, losing {armour} armour for {exposed}s. Sets up the pull and the Martyrdom.',
    values: (f) => {
      const exposed = f.statuses.find((x) => x.id === 'exposed');
      return {
        radius: penitentOf(f)?.chain.radius,
        duration: penitentOf(f)?.chain.tauntSeconds,
        armour: exposed?.value,
        exposed: exposed?.duration,
      };
    },
  },
  {
    effect: 'martyrdom',
    text: 'For {duration}s every enemy within {radius} is Taunted onto him. He takes only {loss}% of the damage as lost hp, yet banks all of it as Pain. It ends in a nova of {nova}% of the Pain banked, hitting enemies within {novaRadius}. Then he is Spent for {spent}s.',
    values: (f) => {
      const m = penitentOf(f)?.martyrdom;
      return {
        duration: m?.seconds,
        radius: m?.tauntRadius,
        loss: percent(m?.hpLossMult),
        nova: percent(m?.novaPainMult),
        novaRadius: m?.novaRadius,
        spent: m?.spentSeconds,
      };
    },
  },
  {
    effect: 'lash',
    text: 'Hurl a gravitic lash at a point within {range}. Enemies within {radius} are dragged {distance} toward it and left Clumped: +{bonus}% damage from cone, line and splash hits for {duration}s. Adds {warp} Warp. At full Warp the pull widens to {radiusMax}, drags {distanceMax} and the bonus reaches +{bonusMax}%.',
    values: (f) => {
      const l = psykerOf(f)?.lash;
      return {
        range: l?.range,
        radius: l?.radius,
        distance: l?.distance,
        bonus: percent(l?.clumped),
        duration: l?.clumpedSeconds,
        warp: l?.warpGain,
        radiusMax: l === undefined ? undefined : l.radius + l.radiusPerW,
        distanceMax: l === undefined ? undefined : l.distance + l.distancePerW,
        bonusMax: l === undefined ? undefined : percent(l.clumped + l.clumpedPerW),
      };
    },
  },
  {
    effect: 'furnace',
    text: 'For {active}s the Gunner cannot overheat and every shot pierces armour and overpenetrates in a line, hitting allies in the line too. Then she is forced to vent for {vent}s and cannot fire.',
    values: (f) => {
      const g = gunnerOf(f);
      return { active: g?.furnace.activeSeconds, vent: g?.furnace.ventSeconds };
    },
  },
  {
    effect: 'taunt',
    text: 'Enemies within {radius} of the caster are Taunted for {duration}s: they go for a live taunter first. Does nothing if no enemy is in reach.',
    values: (f) => ({ radius: standinOf(f, 'taunt')?.radius, duration: standinOf(f, 'taunt')?.duration }),
  },
  {
    effect: 'mark',
    text: 'Mark one hostile within {range} of the caster (the aimed unit, else the nearest) for {duration}s. The next hit it takes deals +{bonus}% damage and uses up the mark.',
    values: (f) => {
      const a = standinOf(f, 'mark');
      return { range: a?.range, duration: a?.duration, bonus: percent(a?.value) };
    },
  },
  {
    effect: 'heal',
    text: 'Heal every hero within {radius} of the caster, the caster included, for {amount} hp (never past full). Does nothing when everyone in reach is at full hp.',
    values: (f) => ({ radius: standinOf(f, 'heal')?.radius, amount: standinOf(f, 'heal')?.amount }),
  },
  {
    effect: 'pull',
    text: 'Drag enemies within {radius} of the aimed point (which must be within {range} of the caster) up to {distance} toward it, then leave them Clumped for {duration}s: +{bonus}% damage from cone, line and splash hits.',
    values: (f) => {
      const a = standinOf(f, 'pull');
      return {
        radius: a?.radius,
        range: a?.range,
        distance: a?.distance,
        duration: a?.duration,
        bonus: percent(a?.value),
      };
    },
  },
];

const STATUS_HELP: readonly StatusHelp[] = [
  {
    id: 'marked',
    appliedBy: 'mark',
    text: 'The next hit taken deals +{bonus}% damage and ends the mark. Lasts {duration}s.',
    bare: 'The next hit taken deals bonus damage and ends the mark.',
    values: (d) => ({ bonus: percent(d?.value), duration: d?.duration }),
  },
  {
    id: 'clumped',
    appliedBy: 'pull',
    text: 'Takes +{bonus}% damage from cone, line and splash hits for {duration}s.',
    bare: 'Takes bonus damage from cone, line and splash hits.',
    values: (d) => ({ bonus: percent(d?.value), duration: d?.duration }),
  },
  {
    id: 'taunted',
    appliedBy: 'taunt',
    text: 'Goes for the taunter first while a live taunter is on it ({duration}s).',
    bare: 'Goes for the taunter first while a live taunter is on it.',
    values: (d) => ({ duration: d?.duration }),
  },
  {
    id: 'rooted',
    text: 'Cannot move and ignores move commands. A braced Gunner is rooted until she unbraces.',
    values: () => ({}),
  },
  {
    id: 'exposed',
    text: 'Loses {armour} armour for {duration}s, so every hit lands harder. The Penitent applies it with Chain of Penance.',
    values: (d) => ({ armour: d?.value, duration: d?.duration }),
  },
  {
    id: 'spent',
    text: 'After Martyrdom the Penitent is Spent for {duration}s: Pain locked at 0, {armour} less armour and no taunt.',
    values: (_d, f) => {
      const m = penitentIn(f.heroes)?.martyrdom;
      return { duration: m?.spentSeconds, armour: m?.spentArmourPenalty };
    },
  },
  {
    id: 'martyrdom',
    text: 'Martyrdom is active for {duration}s: enemies are Taunted onto the Penitent, who takes {loss}% of the damage and banks all of it as Pain. Friendly fire cannot drop him below 1 hp.',
    values: (_d, f) => {
      const m = penitentIn(f.heroes)?.martyrdom;
      return { duration: m?.seconds, loss: percent(m?.hpLossMult) };
    },
  },
  {
    id: 'discharge',
    text: 'Warp backlash. Casting above {free} Warp risks a Discharge: {base} plus the current Warp as damage to everything within {radius} of the Psyker, allies included.',
    values: (_d, f) => {
      const b = psykerIn(f.heroes)?.backlash;
      return { free: b?.freeBelow, base: b?.baseDamage, radius: b?.radius };
    },
  },
];

interface ResourceHelp {
  /** The perception `ResourceView.name`. */
  readonly name: string;
  readonly text: string;
  readonly values: (def: HeroDef | undefined) => Values;
}

const RESOURCE_HELP: readonly ResourceHelp[] = [
  {
    name: 'heat',
    text: 'Every shot adds heat; it bleeds off while she has nothing to shoot. Above {pierce}% rounds ignore armour, above {overpen}% they overpenetrate and hit allies in the line. At 100% she overheats and cannot fire for {overheat}s.',
    values: (d) => {
      const g = d?.kit === 'gunner' ? d : undefined;
      return {
        pierce: percent(g?.heat.pierceAbove),
        overpen: percent(g?.heat.overpenAbove),
        overheat: g?.heat.overheatSeconds,
      };
    },
  },
  {
    name: 'pain',
    text: 'Banked from every wound he takes (friendly fire counts x{ff}) and drained at {drain}% of the bar per second after {delay}s unhurt. Heals on him restore only {heal}%. Wound-Zeal adds up to +{zeal}% damage as his hp runs out.',
    values: (d) => {
      const p = d?.kit === 'penitent' ? d : undefined;
      return {
        ff: p?.pain.friendlyFireMult,
        drain: percent(p?.pain.drainPerSecond),
        delay: p?.pain.drainDelaySeconds,
        heal: percent(p?.pain.healMult),
        zeal: percent(p?.zeal.maxBonus),
      };
    },
  },
  {
    name: 'warp',
    text: 'Each Warp point adds {power}% to his spell power. Basic-attack hits add {hit}; it decays {decay} per second. Past the mark on the bar every cast risks backlash.',
    values: (d) => {
      const w = d?.kit === 'psyker' ? d : undefined;
      return { power: percent(w?.warp.powerPerPoint), hit: w?.warp.perHit, decay: w?.warp.decayPerSecond };
    },
  },
  {
    name: 'backlash',
    text: 'The chance a cast Discharges. None up to {free} Warp, then {chance}% for every point above. Discharge hits everyone within {radius}, allies too, for {base} plus his Warp.',
    values: (d) => {
      const b = d?.kit === 'psyker' ? d.backlash : undefined;
      return {
        free: b?.freeBelow,
        chance: percent(b?.chancePerPoint),
        radius: b?.radius,
        base: b?.baseDamage,
      };
    },
  },
];

/** The filled description of a hero resource bar; undefined when help has no entry for it. */
export function describeResource(name: string, def: HeroDef | undefined): string | undefined {
  const entry = RESOURCE_HELP.find((h) => h.name === name);
  return entry === undefined ? undefined : fillTemplate(entry.text, entry.values(def));
}

/** Every resource help entry and what `def` leaves unfilled in it, for invariant tests. */
export function resourceTemplates(): { name: string; unfilled: (def: HeroDef | undefined) => string[] }[] {
  return RESOURCE_HELP.map((h) => ({ name: h.name, unfilled: (def) => unfilled(h.text, h.values(def)) }));
}

/** Help for the call-next-wave control. */
export function describeCallWave(): string {
  return `Start the next wave now instead of waiting for the timer (key ${UI_TEXT.callWave.key}). Nothing happens once every wave has been sent.`;
}

/** Help for the fallen state and its respawn countdown, from the rules. */
export function describeFallen(rules: RulesDef): string {
  const { base, perWave, max } = rules.respawn;
  const wipe = rules.wipeLoses
    ? ' If every hero is down at once the game is lost.'
    : ' Only the Ancient falling ends the game.';
  return (
    fillTemplate(
      'A fallen hero returns at the spawn point with full hp. The wait is {base}s plus {perWave}s per wave started, never more than {max}s.',
      { base, perWave, max },
    ) + wipe
  );
}

/** The aiming line shown on an ability card. */
export const TARGETING_TEXT: Readonly<Record<Targeting, string>> = {
  instant: 'Instant',
  direction: 'Aim a direction',
  point: 'Aim a point',
  unit: 'Pick a unit',
};

/** A number for prose: whole numbers as is, otherwise one decimal. */
function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** `{name}` placeholders in `template` that `values` cannot fill (missing or not finite). */
export function unfilled(template: string, values: Values): string[] {
  const missing: string[] = [];
  for (const m of template.matchAll(/\{(?<key>\w+)\}/gu)) {
    const key = m.groups?.key ?? '';
    const v = values[key];
    if (v === undefined || !Number.isFinite(v)) {
      missing.push(key);
    }
  }
  return missing;
}

/** Fills `{name}` placeholders; one that cannot be filled becomes `?`. */
export function fillTemplate(template: string, values: Values): string {
  return template.replace(/\{(?<key>\w+)\}/gu, (_all, key: string) => {
    const v = values[key];
    return v === undefined || !Number.isFinite(v) ? '?' : formatNumber(v);
  });
}

export interface AbilityDescription {
  readonly text: string;
  /** Empty when the ability is free. */
  readonly cost: string;
  readonly toggle: boolean;
}

/** The filled description of an ability effect; undefined when help has no entry for it. */
export function describeAbility(effect: string, facts: AbilityFacts): AbilityDescription | undefined {
  const entry = ABILITY_HELP.find((h) => h.effect === effect);
  if (entry === undefined) {
    return undefined;
  }
  const values = entry.values(facts);
  return {
    text: fillTemplate(entry.text, values),
    cost: entry.cost === undefined ? '' : fillTemplate(entry.cost, values),
    toggle: entry.toggle === true,
  };
}

/**
 * The value and duration the sim applies `entry`'s status with: the one ability that applies it
 * (several that disagree, or none, give undefined), else the status def.
 */
function statusSource(entry: StatusHelp, f: StatusFacts): StatusDef | undefined {
  const def = f.statuses.find((s) => s.id === entry.id);
  if (entry.appliedBy === undefined) {
    return def;
  }
  const sources = f.heroes
    .flatMap((h) => (h.kit === 'standin' ? h.abilities : []))
    .filter((a) => a.effect === entry.appliedBy)
    .map((a) => ({ id: entry.id, duration: 'duration' in a ? a.duration : 0, value: 'value' in a ? a.value : 0 }));
  const [first] = sources;
  return sources.every((x) => x.duration === first?.duration && x.value === first.value) ? first : undefined;
}

function statusText(entry: StatusHelp, f: StatusFacts): string {
  const source = statusSource(entry, f);
  if (entry.appliedBy !== undefined && source === undefined) {
    return entry.bare ?? '';
  }
  return fillTemplate(entry.text, entry.values(source, f));
}

/** The filled description of a status; undefined when help has no entry for it. */
export function describeStatus(id: string, facts: StatusFacts): string | undefined {
  const entry = STATUS_HELP.find((h) => h.id === id);
  return entry === undefined ? undefined : statusText(entry, facts);
}

/** Every ability template with a probe for what `facts` leaves unfilled in it (text and cost), for invariant tests. */
export function abilityTemplates(): { effect: string; unfilled: (facts: AbilityFacts) => string[] }[] {
  return ABILITY_HELP.map((h) => ({
    effect: h.effect,
    unfilled: (facts) => {
      const values = h.values(facts);
      return [...unfilled(h.text, values), ...unfilled(h.cost ?? '', values)];
    },
  }));
}

/** Every status template and what it fails to fill (a status with no single applier fills its numberless text). */
export function statusTemplates(facts: StatusFacts): { id: string; unfilled: string[] }[] {
  return STATUS_HELP.map((h) => {
    const source = statusSource(h, facts);
    const bare = h.appliedBy !== undefined && source === undefined;
    return { id: h.id, unfilled: bare ? [] : unfilled(h.text, h.values(source, facts)) };
  });
}
