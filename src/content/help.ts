// Help text for the help overlay (H / "?"): one entry per ability effect and status id. Pure data
// plus a template filler; never hashed, the sim never reads it. Descriptions are TEMPLATES whose
// `{name}` placeholders are filled from content data (the hero def, the status defs) and from the
// perception ability view (cooldown, range, radius) at render time, so tuning a number can never
// make the help lie. No gameplay number is typed into prose here. An id without an entry gets no
// description (the card still shows what perception and presentation know). The text describes what
// the sim does today (src/sim/heroes/*, combat.ts, statuses.ts); change both together.

import type { GunnerDef } from './heroes/gunner.ts';
import type { StandinAbilityDef } from './heroes/standins.ts';
import type { HeroDef } from './index.ts';
import type { Targeting } from './presentation.ts';
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
  readonly values: (def: StatusDef | undefined) => Values;
}

function gunnerOf(f: AbilityFacts): GunnerDef | undefined {
  return f.def?.kit === 'gunner' ? f.def : undefined;
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

const percent = (fraction: number | undefined): number | undefined =>
  fraction === undefined ? undefined : fraction * 100;

function statusOf(f: AbilityFacts, id: string): StatusDef | undefined {
  return f.statuses.find((s) => s.id === id);
}

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
    effect: 'suppress',
    text: 'Fire a {cone} degree cone out to {range} range: {damage} damage to each enemy hit and Suppressed, slowing them by {slow}% for {duration}s. Cannot be used while locked out.',
    cost: '+{heat}% heat',
    values: (f) => {
      const g = gunnerOf(f);
      const slow = statusOf(f, 'suppressed');
      return {
        cone: g?.suppress.coneDegrees,
        range: g?.suppress.range,
        damage: g?.suppress.damage,
        heat: percent(g?.suppress.heatCost),
        slow: percent(slow?.value),
        duration: slow?.duration,
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
    id: 'suppressed',
    text: 'Moves {slow}% slower for {duration}s.',
    values: (d) => ({ slow: percent(d?.value), duration: d?.duration }),
  },
  {
    id: 'marked',
    text: 'The next hit taken deals +{bonus}% damage and ends the mark. Lasts {duration}s.',
    values: (d) => ({ bonus: percent(d?.value), duration: d?.duration }),
  },
  {
    id: 'exposed',
    text: 'Armour reduced by {armour} while it lasts ({duration}s); armour never drops below zero.',
    values: (d) => ({ armour: d?.value, duration: d?.duration }),
  },
  {
    id: 'clumped',
    text: 'Takes +{bonus}% damage from cone, line and splash hits for {duration}s.',
    values: (d) => ({ bonus: percent(d?.value), duration: d?.duration }),
  },
  {
    id: 'taunted',
    text: 'Goes for the taunter first while a live taunter is on it ({duration}s).',
    values: (d) => ({ duration: d?.duration }),
  },
  {
    id: 'rooted',
    text: 'Cannot move and ignores move commands. A braced Gunner is rooted until she unbraces.',
    values: () => ({}),
  },
];

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

/** The filled description of a status; undefined when help has no entry for it. */
export function describeStatus(id: string, statuses: readonly StatusDef[]): string | undefined {
  const entry = STATUS_HELP.find((h) => h.id === id);
  if (entry === undefined) {
    return undefined;
  }
  return fillTemplate(entry.text, entry.values(statuses.find((s) => s.id === id)));
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

/** Every status template and what it fails to fill. */
export function statusTemplates(statuses: readonly StatusDef[]): { id: string; unfilled: string[] }[] {
  return STATUS_HELP.map((h) => ({
    id: h.id,
    unfilled: unfilled(h.text, h.values(statuses.find((s) => s.id === h.id))),
  }));
}
