// Presentation content: kit-agnostic UI data for the client shell (wave 7 DESIGN "Presentation
// content"). Pure data plus fallback lookups. Not part of `GameConfig`, never hashed, not
// overridable, and the sim never reads it. The shell looks abilities up by their perception
// `effect`, resources by `name`, statuses by `id` and units by def id; a missing entry is not an
// error: every lookup falls back (label = id, hashed colour, targeting from range and radius), so
// a new hero is playable before it has an entry. Shell code must not switch on any of these ids.
// Icons are path data (icons.ts); an entry without one renders its glyph text.

import { ABILITY_ICONS, STATUS_ICONS, UI_ICONS } from './icons.ts';

/** How an ability is aimed. `instant` casts on press; the others need a world point or a unit. */
export type Targeting = 'instant' | 'direction' | 'point' | 'unit';

export interface AbilityPresentation {
  /** The perception `AbilityView.effect` this entry describes. */
  readonly effect: string;
  readonly label: string;
  /** One or two characters for buttons and markers. */
  readonly glyph: string;
  /** SVG path `d` on a 24x24 viewBox; absent means the glyph text is shown. */
  readonly icon?: string | undefined;
  readonly targeting: Targeting;
  /** Can be posted as an `intent post` (a timed trigger). */
  readonly armable: boolean;
  /** The `intentKind` an armed post carries; defaults to `effect`. Bots reserve against `'pull'`. */
  readonly intentKind?: string;
}

export interface ResourcePresentation {
  /** The perception `ResourceView.name`. */
  readonly name: string;
  readonly label: string;
  /** `#rrggbb`. */
  readonly color: string;
}

export interface StatusPresentation {
  /** The status id (`StatusView.status`). */
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  /** SVG path `d` on a 24x24 viewBox; absent means the glyph text is shown. */
  readonly icon?: string | undefined;
  /** `#rrggbb`. */
  readonly color: string;
  /** A debuff on the unit carrying it (on an enemy, good for the team). */
  readonly harmful: boolean;
}

export interface UnitPresentation {
  /** Hero or enemy def id. */
  readonly id: string;
  readonly label: string;
  /** `#rrggbb`. */
  readonly color: string;
  /** Body shape hint for the scene; absent means circle. */
  readonly shape?: 'circle' | 'box' | 'triangle';
}

export interface BargainPresentation {
  /** `BargainDef.id`. */
  readonly id: string;
  readonly label: string;
  /** One or two characters for pips. */
  readonly glyph: string;
  /** `#rrggbb`. */
  readonly color: string;
}

export interface Presentation {
  /** Bargain names and colours by id; an id without an entry reads as its id spelt out (see `bargainPresentation`). */
  readonly bargains?: readonly BargainPresentation[];
  readonly abilities: readonly AbilityPresentation[];
  readonly resources: readonly ResourcePresentation[];
  readonly statuses: readonly StatusPresentation[];
  readonly heroes: readonly UnitPresentation[];
  readonly enemies: readonly UnitPresentation[];
}

/** Strings and icons for the non-ability UI: the fallen state and the call-next-wave control. */
export const UI_TEXT = {
  fallen: { label: 'Fallen', icon: UI_ICONS.fallen },
  callWave: { label: 'Call next wave', key: 'N', icon: UI_ICONS.callWave },
  bargain: { label: 'Bargain', decline: 'Decline', team: 'The team' },
} as const;

/** The respawn countdown line for a fallen hero; `ticksLeft` and `hz` come from perception and the sim clock. */
export function respawnText(ticksLeft: number, hz: number): string {
  return `Returns in ${Math.max(0, Math.ceil(ticksLeft / hz))}s`;
}

export function defaultPresentation(): Presentation {
  return {
    // Slice B's pool names go here, by id; until then every bargain uses the id-derived fallback.
    bargains: [],
    abilities: [
      {
        effect: 'brace',
        label: 'Brace',
        glyph: 'Br',
        icon: ABILITY_ICONS.brace,
        targeting: 'direction',
        armable: false,
      },
      { effect: 'vent', label: 'Vent', glyph: 'Vt', icon: ABILITY_ICONS.vent, targeting: 'direction', armable: true },
      {
        effect: 'pavise',
        label: 'Pavise',
        glyph: 'Pv',
        icon: ABILITY_ICONS.pavise,
        targeting: 'direction',
        armable: true,
      },
      {
        effect: 'furnace',
        label: 'Furnace Heart',
        glyph: 'Fh',
        icon: ABILITY_ICONS.furnace,
        targeting: 'instant',
        armable: true,
      },
      {
        effect: 'chain',
        label: 'Chain of Penance',
        glyph: 'Ch',
        icon: ABILITY_ICONS.chain,
        targeting: 'instant',
        armable: true,
      },
      {
        effect: 'martyrdom',
        label: 'Martyrdom',
        glyph: 'Ma',
        icon: ABILITY_ICONS.martyrdom,
        targeting: 'instant',
        armable: false,
      },
      {
        effect: 'lash',
        label: 'Gravitic Lash',
        glyph: 'Gl',
        icon: ABILITY_ICONS.lash,
        targeting: 'point',
        armable: true,
        intentKind: 'pull',
      },
      { effect: 'taunt', label: 'Taunt', glyph: 'Ta', icon: ABILITY_ICONS.taunt, targeting: 'instant', armable: true },
      { effect: 'mark', label: 'Mark', glyph: 'Mk', icon: ABILITY_ICONS.mark, targeting: 'unit', armable: false },
      { effect: 'heal', label: 'Heal', glyph: 'He', icon: ABILITY_ICONS.heal, targeting: 'instant', armable: true },
      {
        effect: 'pull',
        label: 'Pull',
        glyph: 'Pu',
        icon: ABILITY_ICONS.pull,
        targeting: 'point',
        armable: true,
        intentKind: 'pull',
      },
    ],
    resources: [
      { name: 'heat', label: 'Heat', color: '#e8832a' },
      { name: 'pain', label: 'Pain', color: '#c0172f' },
      { name: 'warp', label: 'Warp', color: '#8f5fd6' },
      // The Psyker's chance of Discharge as a second bar: sickly yellow-green, apart from Warp violet.
      { name: 'backlash', label: 'Backlash', color: '#c9d63a' },
    ],
    statuses: [
      {
        id: 'suppressed',
        label: 'Suppressed',
        glyph: 'Su',
        icon: STATUS_ICONS.suppressed,
        color: '#6aa0ff',
        harmful: true,
      },
      { id: 'marked', label: 'Marked', glyph: 'Mk', icon: STATUS_ICONS.marked, color: '#e0c030', harmful: true },
      { id: 'exposed', label: 'Exposed', glyph: 'Ex', icon: STATUS_ICONS.exposed, color: '#d05050', harmful: true },
      { id: 'clumped', label: 'Clumped', glyph: 'Cl', icon: STATUS_ICONS.clumped, color: '#c45fa0', harmful: true },
      { id: 'taunted', label: 'Taunted', glyph: 'Tn', icon: STATUS_ICONS.taunted, color: '#c8a050', harmful: true },
      { id: 'rooted', label: 'Rooted', glyph: 'Rt', icon: STATUS_ICONS.rooted, color: '#8a7a5a', harmful: true },
      // Kit states (Penitent and Psyker), listed beside the statuses in the legend.
      { id: 'spent', label: 'Spent', glyph: 'Sp', icon: STATUS_ICONS.spent, color: '#7d7468', harmful: true },
      {
        id: 'martyrdom',
        label: 'Martyrdom',
        glyph: 'Ma',
        icon: STATUS_ICONS.martyrdom,
        color: '#f0c040',
        harmful: false,
      },
      {
        id: 'discharge',
        label: 'Discharge',
        glyph: 'Dc',
        icon: STATUS_ICONS.discharge,
        color: '#c9d63a',
        harmful: true,
      },
    ],
    heroes: [
      { id: 'gunner', label: 'Gunner', color: '#e8832a' },
      { id: 'penitent', label: 'Penitent', color: '#a8302c' },
      { id: 'psyker', label: 'Psyker', color: '#8f5fd6' },
      { id: 'tank', label: 'Tank', color: '#3b82c4' },
      { id: 'ranged', label: 'Ranger', color: '#2fa36b' },
      { id: 'support', label: 'Support', color: '#c45fa0' },
    ],
    enemies: [
      { id: 'runner', label: 'Runner', color: '#c85a3c', shape: 'triangle' },
      { id: 'grunt', label: 'Grunt', color: '#b04030' },
      { id: 'brute', label: 'Brute', color: '#8c2e28', shape: 'box' },
      { id: 'boss', label: 'Boss', color: '#d02050', shape: 'box' },
    ],
  };
}

/** Stable hue 0..359 from a string. */
function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) % 360;
  }
  return h;
}

/** `#rrggbb` for an HSL colour (h 0..359, s and l 0..1). */
function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** A stable `#rrggbb` for an id with no presentation colour. */
export function hashedColor(id: string): string {
  return hslHex(hueOf(id), 0.55, 0.55);
}

/** The aiming mode when an ability has no entry: a point if it has range and an area, a unit if only range, else instant. */
export function fallbackTargeting(range: number, radius: number): Targeting {
  if (range > 0 && radius > 0) {
    return 'point';
  }
  return range > 0 ? 'unit' : 'instant';
}

/** What the shell knows about an ability that has no entry: its perception range and radius. */
export interface AbilityShape {
  readonly range: number;
  readonly radius: number;
}

export function abilityPresentation(ui: Presentation, effect: string, shape: AbilityShape): AbilityPresentation {
  return (
    ui.abilities.find((a) => a.effect === effect) ?? {
      effect,
      label: effect,
      glyph: effect.slice(0, 2),
      targeting: fallbackTargeting(shape.range, shape.radius),
      armable: false,
    }
  );
}

/** The `intentKind` an armed post of this ability carries. */
export function intentKindOf(a: AbilityPresentation): string {
  return a.intentKind ?? a.effect;
}

export function resourcePresentation(ui: Presentation, name: string): ResourcePresentation {
  return ui.resources.find((r) => r.name === name) ?? { name, label: name, color: hashedColor(name) };
}

export function statusPresentation(ui: Presentation, id: string): StatusPresentation {
  return (
    ui.statuses.find((s) => s.id === id) ?? {
      id,
      label: id,
      glyph: id.slice(0, 2),
      color: hashedColor(id),
      harmful: true,
    }
  );
}

export function heroPresentation(ui: Presentation, id: string): UnitPresentation {
  return ui.heroes.find((h) => h.id === id) ?? { id, label: id, color: hashedColor(id) };
}

export function enemyPresentation(ui: Presentation, id: string): UnitPresentation {
  return ui.enemies.find((e) => e.id === id) ?? { id, label: id, color: hashedColor(id) };
}

const CAMEL_BOUNDARY = /(?<a>[a-z0-9])(?<b>[A-Z])/gu;
const WORD_BREAK = /[\s._-]+/u;

/** `unvented-barrel` or `unventedBarrel` as `Unvented Barrel`. */
function titleCase(id: string): string {
  return id
    .replace(CAMEL_BOUNDARY, '$<a> $<b>')
    .split(WORD_BREAK)
    .filter((w) => w !== '')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function bargainPresentation(ui: Presentation, id: string): BargainPresentation {
  const found = ui.bargains?.find((b) => b.id === id);
  if (found !== undefined) {
    return found;
  }
  const label = titleCase(id);
  return { id, label: label === '' ? id : label, glyph: label.slice(0, 2), color: hashedColor(id) };
}
