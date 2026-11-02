// Pure: Perception + presentation + controls -> HudModel. Owner: w7-hud.
// Kit-agnostic: nothing here switches on a hero, kit, ability, status or resource name.

import {
  describeAbility,
  describeBargain,
  describeBargainRules,
  describeCallWave,
  describeFallen,
  describeResource,
  describeStatus,
  effectiveHeroDef,
  TARGETING_TEXT,
} from '../../content/help.ts';
import type { Presentation } from '../../content/presentation.ts';
import {
  abilityPresentation,
  bargainPresentation,
  enemyPresentation,
  heroPresentation,
  intentKindOf,
  resourcePresentation,
  respawnText,
  statusPresentation,
  UI_TEXT,
} from '../../content/presentation.ts';
import type { CardView, HeroView, IntentView, OfferView, Perception, TakenView } from '../../perception/types.ts';
import { TICK_HZ } from '../../sim/time.ts';
import { ARM_MAX_HALF_SECONDS, ARM_MIN_HALF_SECONDS, maxOffsetHalfSeconds } from './arming.ts';
import { BARGAIN_CARD_KEYS, KEY_BARGAIN_DECLINE } from './input.ts';
import type {
  AbilityBarModel,
  AbilityButtonModel,
  ArmPickerModel,
  BargainCardModel,
  BargainHudModel,
  BargainOfferModel,
  BargainPipModel,
  BargainSent,
  ControlState,
  HelpBargainsModel,
  HelpModel,
  HeroCardModel,
  HudInput,
  HudModel,
  HudNetInput,
  Insets,
  IntentRowModel,
  NetPanelModel,
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
  const nextInSeconds = pending ? secondsBetween(p.tick, p.wave.nextAt) : 0;
  return {
    wave: p.wave.n,
    total: p.wave.total,
    nextInSeconds,
    canCallWave: p.wave.canCall,
    preview,
    previewHidden: preview.length === 0 && pending,
    ancientFrac: clamp01(p.ancient.hpFrac),
    paused: controls.paused || input.paused === true || input.net?.status === 'paused',
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

/** Whole seconds shown for a respawn timer: rounded up, so the card never reads 0 while still down. */
function respawnSecondsOf(ticks: number): number {
  return Math.max(1, Math.ceil(ticks / TICK_HZ));
}

/** The badge of a slot: the local human ('you'), another human ('other', with their name), or a bot. */
function badgeOf(input: HudInput, slot: number): Pick<HeroCardModel, 'badge' | 'badgeLabel'> {
  if (input.driven.includes(slot)) {
    return { badge: 'you' };
  }
  if (input.others?.includes(slot) === true) {
    const name = input.names?.[slot];
    return name === undefined || name === '' ? { badge: 'other' } : { badge: 'other', badgeLabel: name };
  }
  return { badge: 'bot' };
}

/** A downed hero keeps its name and colour (from `p.fallen`) and counts down; a slot with no hero at all is blank. */
function deadCard(input: HudInput, slot: number): HeroCardModel {
  const { p, ui, controls } = input;
  const fallen = p.fallen.find((f) => f.slot === slot);
  const pres = fallen === undefined ? undefined : heroPresentation(ui, fallen.def);
  return {
    slot,
    def: fallen?.def ?? '',
    label: pres?.label ?? `Hero ${slot + 1}`,
    color: pres?.color ?? DEAD_COLOR,
    hpFrac: 0,
    hp: 0,
    maxHp: 0,
    resources: [],
    statuses: [],
    ...badgeOf(input, slot),
    selected: controls.selected === slot,
    dead: true,
    respawnSeconds: fallen === undefined ? undefined : respawnSecondsOf(fallen.respawnTicks),
    respawnLabel: fallen === undefined ? undefined : respawnText(fallen.respawnTicks, TICK_HZ),
    fallenLabel: UI_TEXT.fallen.label,
  };
}

/** The hero a card benefits, by entity id: a live or fallen hero's label, else a generic one. */
function benefitLabel(p: Perception, ui: Presentation, card: CardView): string {
  if (card.scope === 'team') {
    return UI_TEXT.bargain.team;
  }
  const def = p.heroes.find((h) => h.id === card.hero)?.def ?? p.fallen.find((f) => f.id === card.hero)?.def;
  return def === undefined ? 'A hero' : heroPresentation(ui, def).label;
}

/** What card text reads besides the card: perception (who the heroes are), presentation and the game's hero defs. */
type TextWorld = Pick<HudInput, 'p' | 'ui' | 'game'>;

function bargainLines(
  world: TextWorld,
  card: {
    readonly scope: 'hero' | 'team';
    readonly hero: number;
    readonly gains: CardView['gains'];
    readonly costs: CardView['costs'];
  },
): { gains: readonly string[]; costs: readonly string[] } {
  return describeBargain(card, {
    scope: card.scope,
    enemy: (id) => enemyPresentation(world.ui, id).label,
    base: (e) => e.base,
  });
}

/** Pips for the accepted bargains that apply to `h`, with a tooltip of their gains and costs. */
function bargainPips(h: HeroView, world: TextWorld): BargainPipModel[] {
  const { p, ui } = world;
  return h.bargains.map((id) => {
    const pres = bargainPresentation(ui, id);
    const taken = p.bargains.taken.find((t) => t.bargain === id);
    const lines =
      taken === undefined ? undefined : bargainLines(world, { scope: taken.hero === 0 ? 'team' : 'hero', ...taken });
    const tooltip = [
      pres.label,
      ...(lines?.gains.map((g) => `+ ${g}`) ?? []),
      ...(lines?.costs.map((c) => `- ${c}`) ?? []),
    ];
    return { id, label: pres.label, glyph: pres.glyph, color: pres.color, tooltip: tooltip.join('\n') };
  });
}

function heroCards(input: HudInput): HeroCardModel[] {
  const { p, ui, controls } = input;
  const longest = longestRemaining(p);
  const cards: HeroCardModel[] = [];
  for (let slot = 0; slot < HERO_SLOTS; slot++) {
    const h = p.heroes.find((x) => x.slot === slot);
    const selected = controls.selected === slot;
    if (h === undefined) {
      cards.push(deadCard(input, slot));
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
      ...badgeOf(input, slot),
      selected,
      dead: false,
      respawnSeconds: undefined,
      respawnLabel: undefined,
      fallenLabel: '',
      bargains: bargainPips(h, input),
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

/** The Bargains section of help: the rules from the config, then what was accepted; undefined when the game has no bargains. */
function helpBargains(input: HudInput): HelpBargainsModel | undefined {
  const { p, ui, game } = input;
  if (game?.bargains === undefined) {
    return undefined;
  }
  const taken = p.bargains.taken.map((t: TakenView) => {
    const lines = bargainLines(input, { scope: t.hero === 0 ? 'team' : 'hero', ...t });
    const hero = p.heroes.find((h) => h.id === t.hero) ?? p.fallen.find((f) => f.id === t.hero);
    return {
      label: bargainPresentation(ui, t.bargain).label,
      who: hero === undefined ? UI_TEXT.bargain.team : heroPresentation(ui, hero.def).label,
      gains: lines.gains,
      costs: lines.costs,
    };
  });
  return { notes: describeBargainRules(game.bargains), taken };
}

/** The help overlay for the selected hero; undefined while closed. Numbers come from the game config and perception. */
function helpModel(input: HudInput): HelpModel | undefined {
  const { p, ui, controls, game } = input;
  if (!controls.help) {
    return undefined;
  }
  const hero = p.heroes.find((h) => h.slot === controls.selected);
  // The effective def: accepted bargains patched in, so the numbers shown are the ones the sim uses.
  const def = effectiveHeroDef(
    game?.heroes.find((d) => d.id === hero?.def),
    p.bargains.taken,
    hero,
  );
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
  const resources = (hero?.resources ?? []).flatMap((r) => {
    const text = describeResource(r.name, def);
    if (text === undefined) {
      return [];
    }
    const pres = resourcePresentation(ui, r.name);
    return [{ label: pres.label, color: pres.color, text }];
  });
  const bargains = helpBargains(input);
  const notes: [string, string][] = [[UI_TEXT.callWave.label, describeCallWave()]];
  if (game !== undefined) {
    notes.push([UI_TEXT.fallen.label, describeFallen(game.rules)]);
  }
  return {
    hero: hero === undefined ? '' : heroPresentation(ui, hero.def).label,
    abilities,
    resources,
    notes,
    statuses,
    ...(bargains === undefined ? {} : { bargains }),
  };
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

const ANCIENT_LABEL = 'Ancient';

/** The slot of a hero entity, up or downed. */
function slotOfHero(p: Perception, id: number): number | undefined {
  return (p.heroes.find((h) => h.id === id) ?? p.fallen.find((h) => h.id === id))?.slot;
}

/** A hero-bound card whose hero another human drives. */
function isTheirs(input: HudInput, c: CardView): boolean {
  if (c.scope !== 'hero' || input.others === undefined) {
    return false;
  }
  const slot = slotOfHero(input.p, c.hero);
  return slot !== undefined && input.others.includes(slot);
}

const NET_TEXT = {
  stalled: [
    'Waiting for the other players',
    "The next tick has not arrived yet. The game resumes by itself. If the host's tab is in the background, ask them to bring it to the front.",
  ],
  desynced: [
    'Out of sync',
    'The players disagree about the game state, so it is halted. Download the dump for the bug report.',
  ],
  hostLeft: ['The host left', 'The session is over.'],
  closed: ['Session ended', 'The session is over.'],
  broken: ['Connection broken', 'The host sent a message this build cannot read, so the session is over.'],
} as const;

/** "Ana (Gunner)": a slot's player name and hero, whichever are known. */
function slotLabel(input: HudInput, slot: number): string {
  const name = input.names?.[slot];
  const hero = input.p.heroes.find((h) => h.slot === slot) ?? input.p.fallen.find((h) => h.slot === slot);
  const heroLabel = hero === undefined ? undefined : heroPresentation(input.ui, hero.def).label;
  const who = name === undefined || name === '' ? undefined : name;
  if (who !== undefined && heroLabel !== undefined) {
    return `${who} (${heroLabel})`;
  }
  return who ?? heroLabel ?? `Player ${slot + 1}`;
}

function noticeText(input: HudInput, kind: 'pause' | 'resume' | 'call' | 'drop', slot: number): string {
  const who = slotLabel(input, slot);
  switch (kind) {
    case 'pause':
      return `${who} paused`;
    case 'call':
      return `${who} called the next wave`;
    case 'resume':
      return `${who} resumed`;
    default:
      return `${who} dropped; a bot has the hero`;
  }
}

type Blocking = Pick<NetPanelModel, 'kind' | 'title' | 'detail'>;

/** The state that stops the game, if any (the end overlay owns a match that ended on its own). */
function blocking(input: HudInput, net: HudNetInput): Blocking | undefined {
  if (input.end !== undefined) {
    return undefined;
  }
  switch (net.status) {
    case 'stalled':
      return { kind: 'stalled', title: NET_TEXT.stalled[0], detail: NET_TEXT.stalled[1] };
    case 'desynced':
      return { kind: 'desynced', title: NET_TEXT.desynced[0], detail: NET_TEXT.desynced[1] };
    case 'paused': {
      const by = net.info.pausedBy;
      return input.coop === true
        ? { kind: 'paused', title: by === undefined ? 'Paused' : `Paused by ${slotLabel(input, by)}`, detail: '' }
        : undefined;
    }
    case 'ended': {
      if (net.info.endedBy === 'broken') {
        const why = net.info.endReason === undefined ? '' : ` (${net.info.endReason})`;
        return { kind: 'ended', title: NET_TEXT.broken[0], detail: `${NET_TEXT.broken[1]}${why}` };
      }
      const [title, detail] = net.info.endedBy === 'host-left' ? NET_TEXT.hostLeft : NET_TEXT.closed;
      return { kind: 'ended', title, detail };
    }
    default:
      return undefined;
  }
}

/** The networked-play panel; undefined when there is nothing to say. */
function netModel(input: HudInput): NetPanelModel | undefined {
  const { net } = input;
  if (net === undefined) {
    return undefined;
  }
  const notes = net.notices.map((n) => noticeText(input, n.kind, n.slot));
  const stop = blocking(input, net);
  if (stop === undefined && notes.length === 0) {
    return undefined;
  }
  return {
    ...(stop === undefined ? { title: '', detail: '' } : stop),
    dump: stop?.kind === 'desynced' && net.canDump,
    notes,
  };
}

function offerModel(input: HudInput, o: OfferView, sent: readonly BargainSent[]): BargainOfferModel {
  const { p, ui, driven, game } = input;
  const mine = sent.find((x) => x.offer === o.id);
  const windowTicks = (game?.bargains?.windowSeconds ?? 0) * TICK_HZ;
  const ticksLeft = Math.max(0, o.expiresAt - p.tick);
  const heal = game?.bargains?.declineAncientHeal ?? 0;
  const cards: BargainCardModel[] = o.cards.map((c, i) => {
    const pres = bargainPresentation(ui, c.bargain);
    const lines = bargainLines(input, c);
    return {
      id: c.bargain,
      label: pres.label,
      glyph: pres.glyph,
      color: pres.color,
      who: benefitLabel(p, ui, c),
      gains: lines.gains,
      costs: lines.costs,
      hotkey: BARGAIN_CARD_KEYS[i] ?? '',
      chosen: mine?.card === c.bargain,
      ...(isTheirs(input, c) ? { theirs: true } : {}),
    };
  });
  return {
    offer: o.id,
    wave: o.wave,
    secondsLeft: Math.ceil(ticksLeft / TICK_HZ),
    frac: windowTicks > 0 ? clamp01(ticksLeft / windowTicks) : 0,
    cards,
    declineReward: heal > 0 ? `${ANCIENT_LABEL} +${Math.round(heal * 1000) / 10}%` : '',
    declineKey: KEY_BARGAIN_DECLINE,
    inFlight: mine !== undefined,
    declined: mine !== undefined && mine.card === undefined,
    // Greyed out while bots pick, and once a command could no longer land before the offer lapses.
    enabled: driven.length > 0 && (input.coop === true || input.botsPick !== true) && ticksLeft > INPUT_DELAY_TICKS,
  };
}

/** Open offers with their cards, countdowns and in-flight state; undefined when none is open. */
function bargainModel(input: HudInput): BargainHudModel | undefined {
  const { open } = input.p.bargains;
  // The offers die with the game.
  if (open.length === 0 || input.end !== undefined) {
    return undefined;
  }
  const sent = input.controls.bargainSent ?? [];
  return {
    offers: open.map((o) => offerModel(input, o, sent)),
    botsPick: input.botsPick === true,
    botsPickLabel: UI_TEXT.bargain.botsPick,
    ...(input.coop === true ? { botsPickHidden: true } : {}),
  };
}

function netPart(input: HudInput): { net: NetPanelModel } | Record<string, never> {
  const net = netModel(input);
  return net === undefined ? {} : { net };
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
    bargain: bargainModel(input),
    ...netPart(input),
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
