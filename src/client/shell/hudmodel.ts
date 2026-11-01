// Pure: Perception + presentation + controls -> HudModel. Owner: w7-hud.
// Kit-agnostic: nothing here switches on a hero, kit, ability, status or resource name.

import { describeAbility, describeStatus, TARGETING_TEXT } from '../../content/help.ts';
import type { Presentation } from '../../content/presentation.ts';
import {
  abilityPresentation,
  enemyPresentation,
  heroPresentation,
  intentKindOf,
  resourcePresentation,
  statusPresentation,
} from '../../content/presentation.ts';
import type { HeroView, IntentView, Perception } from '../../perception/types.ts';
import { TICK_HZ } from '../../sim/time.ts';
import { ARM_MAX_HALF_SECONDS, ARM_MIN_HALF_SECONDS, maxOffsetHalfSeconds } from './arming.ts';
import type {
  AbilityBarModel,
  AbilityButtonModel,
  ArmPickerModel,
  ControlState,
  HelpModel,
  HeroCardModel,
  HudInput,
  HudModel,
  Insets,
  IntentRowModel,
  PreviewChip,
  ResourceBarModel,
  Size,
  StatusPipModel,
  TopBarModel,
} from './types.ts';
import { INPUT_DELAY_TICKS } from './types.ts';

const HERO_SLOTS = 4;
const HOTKEYS = 'QWERTY';
const DEAD_COLOR = '#555555';
/** Picker bounds in seconds; arming.ts is the single source and works in half seconds. */
const FIRE_MIN_SECONDS = ARM_MIN_HALF_SECONDS / 2;
const FIRE_MAX_SECONDS = ARM_MAX_HALF_SECONDS / 2;
const OFFSET_MIN_SECONDS = 0;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) {
    return 0;
  }
  return Math.min(1, Math.max(0, v));
}

function secondsBetween(fromTick: number, toTick: number): number {
  return Math.max(0, (toTick - fromTick) / TICK_HZ);
}

function topBar(input: HudInput): TopBarModel {
  const { p, ui, controls } = input;
  const preview: PreviewChip[] = p.wave.preview.map((g) => {
    const e = enemyPresentation(ui, g.def);
    return { def: g.def, label: e.label, color: e.color, count: g.count };
  });
  const pending = p.wave.n < p.wave.total;
  return {
    wave: p.wave.n,
    total: p.wave.total,
    nextInSeconds: pending ? secondsBetween(p.tick, p.wave.nextAt) : 0,
    preview,
    previewHidden: preview.length === 0 && pending,
    ancientFrac: clamp01(p.ancient.hpFrac),
    paused: controls.paused,
    help: controls.help,
  };
}

/** Longest remaining seconds seen per status id across all heroes: the denominator of the pip ring. */
function longestRemaining(p: Perception): Map<string, number> {
  const longest = new Map<string, number>();
  for (const h of p.heroes) {
    for (const s of h.statuses) {
      const left = secondsBetween(p.tick, s.until);
      longest.set(s.status, Math.max(longest.get(s.status) ?? 0, left));
    }
  }
  return longest;
}

function resourceBars(h: HeroView, ui: Presentation): ResourceBarModel[] {
  return h.resources.map((r) => {
    const pres = resourcePresentation(ui, r.name);
    return {
      name: r.name,
      label: pres.label,
      color: pres.color,
      frac: clamp01(r.frac),
      marks: r.marks.map(clamp01),
    };
  });
}

function statusPips(h: HeroView, p: Perception, ui: Presentation, longest: Map<string, number>): StatusPipModel[] {
  return h.statuses.map((s) => {
    const pres = statusPresentation(ui, s.status);
    const secondsLeft = secondsBetween(p.tick, s.until);
    const max = longest.get(s.status) ?? 0;
    return {
      id: s.status,
      label: pres.label,
      glyph: pres.glyph,
      icon: pres.icon,
      color: pres.color,
      harmful: pres.harmful,
      secondsLeft,
      frac: max > 0 ? clamp01(secondsLeft / max) : 0,
    };
  });
}

function deadCard(slot: number, selected: boolean): HeroCardModel {
  return {
    slot,
    def: '',
    label: `Hero ${slot + 1}`,
    color: DEAD_COLOR,
    hpFrac: 0,
    hp: 0,
    maxHp: 0,
    resources: [],
    statuses: [],
    badge: 'bot',
    selected,
    dead: true,
  };
}

function heroCards(input: HudInput): HeroCardModel[] {
  const { p, ui, controls, driven } = input;
  const longest = longestRemaining(p);
  const cards: HeroCardModel[] = [];
  for (let slot = 0; slot < HERO_SLOTS; slot++) {
    const h = p.heroes.find((x) => x.slot === slot);
    const selected = controls.selected === slot;
    if (h === undefined) {
      cards.push(deadCard(slot, selected));
      continue;
    }
    const pres = heroPresentation(ui, h.def);
    cards.push({
      slot,
      def: h.def,
      label: pres.label,
      color: pres.color,
      hpFrac: clamp01(h.hpFrac),
      hp: h.hp,
      maxHp: h.maxHp,
      resources: resourceBars(h, ui),
      statuses: statusPips(h, p, ui, longest),
      badge: driven.includes(slot) ? 'you' : 'bot',
      selected,
      dead: false,
    });
  }
  return cards;
}

function abilityBar(input: HudInput): AbilityBarModel | undefined {
  const { p, ui, controls, driven } = input;
  const hero = p.heroes.find((h) => h.slot === controls.selected);
  if (hero === undefined) {
    return undefined;
  }
  const enabled = driven.includes(hero.slot);
  const { aim, arming } = controls;
  const buttons: AbilityButtonModel[] = hero.abilities.map((a) => {
    const pres = abilityPresentation(ui, a.effect, a);
    const armingThis = arming.phase !== 'off' && arming.slot === a.slot;
    return {
      slot: a.slot,
      effect: a.effect,
      label: pres.label,
      glyph: pres.glyph,
      icon: pres.icon,
      hotkey: HOTKEYS[a.slot] ?? String(a.slot + 1),
      targeting: pres.targeting,
      ready: a.ready,
      cooldownFrac: a.cooldownTicks > 0 ? clamp01(a.cooldownLeft / a.cooldownTicks) : 0,
      autocast: (hero.autocast & (1 << a.slot)) !== 0,
      armable: pres.armable,
      enabled,
      active: aim?.slot === a.slot || armingThis,
    };
  });
  return { slot: hero.slot, buttons, hold: hero.hold, armOn: arming.armOn, enabled };
}

/** The help overlay for the selected hero; undefined while closed. Numbers come from the game config and perception. */
function helpModel(input: HudInput): HelpModel | undefined {
  const { p, ui, controls, game } = input;
  if (!controls.help) {
    return undefined;
  }
  const hero = p.heroes.find((h) => h.slot === controls.selected);
  const def = game?.heroes.find((d) => d.id === hero?.def);
  const defs = game?.statuses ?? [];
  const abilities = (hero?.abilities ?? []).map((a) => {
    const pres = abilityPresentation(ui, a.effect, a);
    const desc = describeAbility(a.effect, { def, statuses: defs });
    return {
      slot: a.slot,
      label: pres.label,
      glyph: pres.glyph,
      icon: pres.icon,
      hotkey: HOTKEYS[a.slot] ?? String(a.slot + 1),
      targeting: TARGETING_TEXT[pres.targeting],
      cooldownSeconds: desc?.toggle === true ? 0 : a.cooldownTicks / TICK_HZ,
      cost: desc?.cost ?? '',
      text: desc?.text ?? '',
      armable: pres.armable,
    };
  });
  // Only statuses help can describe: one nothing applies has no entry and stays out of the legend.
  const statuses = ui.statuses
    .map((s) => ({
      id: s.id,
      label: s.label,
      glyph: s.glyph,
      icon: s.icon,
      color: s.color,
      harmful: s.harmful,
      text: describeStatus(s.id, { statuses: defs, heroes: game?.heroes ?? [] }) ?? '',
    }))
    .filter((s) => s.text !== '');
  return { hero: hero === undefined ? '' : heroPresentation(ui, hero.def).label, abilities, statuses };
}

function intentRows(input: HudInput): IntentRowModel[] {
  const { p, ui, controls, driven } = input;
  const heroById = new Map<number, HeroView>(p.heroes.map((h) => [h.id, h]));
  const drivenIds = new Set<number>();
  for (const slot of driven) {
    const h = p.heroes.find((x) => x.slot === slot);
    if (h !== undefined) {
      drivenIds.add(h.id);
    }
  }
  const me = p.heroes.find((h) => h.slot === controls.selected);
  const meActive = me !== undefined && drivenIds.has(me.id);
  const row = (ix: IntentView): IntentRowModel => {
    const pres = ui.abilities.find((a) => intentKindOf(a) === ix.intentKind);
    const reserved = me !== undefined && ix.reservers.includes(me.id);
    const own = me !== undefined && ix.by === me.id;
    const open = !ix.fired && ix.fireTick > p.tick + INPUT_DELAY_TICKS;
    return {
      id: ix.id,
      label: pres?.label ?? ix.intentKind,
      glyph: pres?.glyph ?? ix.intentKind.slice(0, 2),
      secondsLeft: ix.fired ? 0 : secondsBetween(p.tick, ix.fireTick),
      fired: ix.fired,
      mine: drivenIds.has(ix.by),
      reserved,
      reservers: ix.reservers.map((id) => {
        const h = heroById.get(id);
        return h === undefined ? DEAD_COLOR : heroPresentation(ui, h.def).color;
      }),
      canReserve: meActive && open && !own && !reserved,
      canCancel: meActive && !ix.fired && (own || reserved),
      selected: controls.arming.intent === ix.id,
    };
  };
  return p.intents.map(row);
}

function picker(controls: ControlState, maxOffsetSeconds: number): ArmPickerModel | undefined {
  const { arming } = controls;
  if (arming.phase === 'time') {
    return {
      mode: 'fire',
      seconds: arming.fireHalfSeconds / 2,
      minSeconds: FIRE_MIN_SECONDS,
      maxSeconds: FIRE_MAX_SECONDS,
    };
  }
  if (arming.phase === 'reserve') {
    return {
      mode: 'reserve',
      seconds: arming.offsetHalfSeconds / 2,
      minSeconds: OFFSET_MIN_SECONDS,
      maxSeconds: maxOffsetHalfSeconds(maxOffsetSeconds) / 2,
    };
  }
  return undefined;
}

function endResult(reason: NonNullable<HudInput['end']>['reason']): 'win' | 'loss' | 'time' {
  switch (reason) {
    case 'victory':
      return 'win';
    case 'maxTicks':
      return 'time';
    default:
      return 'loss';
  }
}

/**
 * The model for one HUD render. Kit-agnostic: ability buttons come from `HeroView.abilities` (one
 * button per entry, so `buttons.length === abilities.length`), resource bars from `resources`
 * (with `marks`), statuses from `statuses`; labels, glyphs and colours from content/presentation.ts
 * fallback lookups. Cooldown fractions are `cooldownLeft / cooldownTicks` (0 when no cooldown). All
 * fractions in [0, 1]. A slot in `driven` is badge 'you', else 'bot'. A dead hero (no perception
 * entry for its slot) is a `dead` card and `bar` is undefined when the selected hero is dead.
 * Never switches on hero, kit or effect names.
 */
export function buildHudModel(input: HudInput): HudModel {
  const { p, controls, end } = input;
  const hint = controls.hint !== undefined && p.tick < controls.hint.untilTick ? controls.hint.text : undefined;
  return {
    top: topBar(input),
    heroes: heroCards(input),
    bar: abilityBar(input),
    intents: intentRows(input),
    picker: picker(controls, input.maxOffsetSeconds),
    hint,
    help: helpModel(input),
    end: end === undefined ? undefined : { result: endResult(end.reason), wave: end.wave },
  };
}

// Layout constants in CSS pixels; hud.css uses the same numbers (--top-h, --bar-h, --cards-h, --col-w).
const TOP_H = 40;
const BAR_H = 68;
const CARDS_H = 96;
const COL_W = 196;

/**
 * CSS pixels the HUD reserves in a viewport, given the safe-area insets: portrait reserves a
 * bottom band (ability bar, then hero cards) and a thin top bar; landscape a left column of hero
 * cards and a bottom-right ability cluster. The shell passes the result to `fitCamera`. Pure.
 */
export function hudInsets(viewport: Size, safe: Insets): Insets {
  if (viewport.width > viewport.height) {
    return {
      top: safe.top + TOP_H,
      right: safe.right,
      bottom: safe.bottom + BAR_H,
      left: safe.left + COL_W,
    };
  }
  return {
    top: safe.top + TOP_H,
    right: safe.right,
    bottom: safe.bottom + BAR_H + CARDS_H,
    left: safe.left,
  };
}
