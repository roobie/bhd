// Bot side of bargains (wave 9). Bots see offers only through Perception (`ctx.p.bargains.open`,
// D-ABIU2YALDBBGMWAR). One seat per game decides the team's offers: `Match` hands this the think of
// the lowest-slot bot seat (not human-driven) whose hero is up, so a downed or human-driven seat never
// decides and a card whose benefiting hero is down can still be taken. One `bargain.offer` decision for the lowest open offer id, options
// `decline` and `accept:<card>` (label: the bargain id, so choice spread shows accept rates per
// bargain). `Match` calls this for that seat when its bargain policy is `bots`, and dedupes the
// commands on the channel `bargain:<offer>`.
//
// The scorer is generic over `EffectView`s: gains minus costs, each effect worth its magnitude times
// a per-kind unit, costs scaled by the situation (weak heroes, armoured preview, leaks, friendly-fire
// line) and by the doctrine's risk. Nothing here names a bargain. `choice.hero` is the benefiting hero
// of the best-scored card (the first living hero for decline and team cards).

import { bargainWeights } from '../content/bots/bargain.ts';
import type { BargainBotPolicy } from '../content/bots.ts';
import type { CardView, EffectView, OfferView, Perception } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import type { BotCtx, Decision, Option } from './types.ts';
import { weight } from './utility.ts';

const DEFAULTS = bargainWeights();
/** Def paths the scorer recognises by name: a hero's own max hp, friendly fire, armour piercing. */
const MAX_HP = /maxhp/iu;
const FRIENDLY_FIRE = /overpen|friendly/iu;
const ARMOUR_PIERCE = /pierce|armou?r/iu;

function w(ctx: BotCtx, key: string): number {
  return weight(ctx.weights, key, DEFAULTS[key] ?? 0);
}

/** The situation terms that scale effects, all derived from Perception. */
interface Situation {
  /** Fallen plus low heroes over all heroes, 0..~1. */
  readonly weak: number;
  /** Share of the next wave's enemies that carry armour, 0..1. */
  readonly armoured: number;
  readonly leaks: number;
  /** Most allies in any hero's overpenetration line. */
  readonly lineAllies: number;
  /** How far below full the Ancient is, 0..1. */
  readonly missing: number;
}

function situation(p: Perception): Situation {
  const total = p.heroes.length + p.fallen.length;
  let enemies = 0;
  let armoured = 0;
  for (const g of p.wave.preview) {
    enemies += g.count;
    armoured += g.armour > 0 ? g.count : 0;
  }
  return {
    weak: total === 0 ? 0 : (p.fallen.length + p.team.lowHeroes) / total,
    armoured: enemies === 0 ? 0 : armoured / enemies,
    leaks: p.team.leaks,
    lineAllies: p.heroes.reduce((m, h) => Math.max(m, h.lineAllies.length), 0),
    missing: Math.max(0, 1 - p.ancient.hpFrac),
  };
}

/** How big an effect is, direction-free: gains and costs are told apart by the list they sit in. */
function magnitude(ctx: BotCtx, e: EffectView): number {
  switch (e.kind) {
    case 'waveExtra':
    case 'masterBudget':
    case 'ancientHeal':
      return Math.abs(e.value);
    case 'def':
      return e.op === 'add' ? Math.abs(e.value) * w(ctx, 'bargain.addScale') : Math.abs(e.value - 1);
    default:
      return Math.abs(e.value - 1);
  }
}

/** Whether the effect makes heroes easier to lose (respawn, damage or heals taken, own max hp). */
function isDurability(e: EffectView): boolean {
  if (e.kind === 'def') {
    return e.def === '' && MAX_HP.test(e.path);
  }
  return e.kind === 'respawn' || e.kind === 'taken' || e.kind === 'healTaken';
}

/** Situation multiplier for one effect; costs also grow with what they would hurt. */
function scale(ctx: BotCtx, s: Situation, e: EffectView, cost: boolean): number {
  let k = 1;
  if (e.kind === 'def' && FRIENDLY_FIRE.test(e.path)) {
    k *= 1 + w(ctx, 'bargain.scale.lineAllies') * s.lineAllies;
  }
  if (!cost) {
    return k;
  }
  if (isDurability(e)) {
    k *= 1 + w(ctx, 'bargain.scale.weakHeroes') * s.weak;
  }
  if (e.kind === 'def' && ARMOUR_PIERCE.test(e.path)) {
    k *= 1 + w(ctx, 'bargain.scale.armoured') * s.armoured;
  }
  if (e.kind === 'waveExtra' || e.kind === 'masterBudget') {
    k *= 1 + w(ctx, 'bargain.scale.leaks') * s.leaks;
  }
  return k;
}

function effectValue(ctx: BotCtx, s: Situation, e: EffectView, cost: boolean): number {
  const unit = w(ctx, `bargain.unit.${e.kind}`);
  if (e.kind === 'ancientHeal') {
    // Healing past full is worth nothing.
    return Math.min(Math.abs(e.value), s.missing) * unit;
  }
  return magnitude(ctx, e) * unit * scale(ctx, s, e, cost);
}

interface Score {
  readonly value: number;
  readonly cost: number;
}

/** Benefit of a card's gains and cost of its costs (risk applied), both finite and >= 0. */
function scoreCard(ctx: BotCtx, s: Situation, card: CardView): Score {
  let value = 0;
  for (const e of card.gains) {
    value += effectValue(ctx, s, e, false);
  }
  let cost = 0;
  for (const e of card.costs) {
    cost += effectValue(ctx, s, e, true);
  }
  const riskScale = Math.max(0, 1 - w(ctx, 'bargain.riskCut') * ctx.doctrine.risk);
  return { value, cost: cost * riskScale };
}

function declineOption(offer: OfferView, value: number): Option {
  const commands: Command[] = [{ kind: 'bargain', op: 'decline', offer: offer.id }];
  return { id: 'decline', value, cost: 0, commands };
}

function acceptOption(offer: OfferView, card: CardView, score: Score): Option {
  const commands: Command[] = [{ kind: 'bargain', op: 'accept', offer: offer.id, card: card.bargain }];
  return { id: `accept:${card.bargain}`, label: card.bargain, value: score.value, cost: score.cost, commands };
}

/** The hero a `choice` names: the best-scored option's card hero, else `owner`. Option 0 is decline. */
function benefiting(offer: OfferView, options: readonly Option[], owner: number): number {
  let at = 0;
  options.forEach((o, i) => {
    const best = options[at];
    if (best !== undefined && o.value - o.cost > best.value - best.cost) {
      at = i;
    }
  });
  const card = at === 0 ? undefined : offer.cards[at - 1];
  return card === undefined || card.hero === 0 ? owner : card.hero;
}

/** The lowest-id open offer, if any. */
function firstOffer(p: Perception): OfferView | undefined {
  let offer: OfferView | undefined;
  for (const o of p.bargains.open) {
    if (offer === undefined || o.id < offer.id) {
      offer = o;
    }
  }
  return offer;
}

function optionsFor(ctx: BotCtx, offer: OfferView, policy: BargainBotPolicy): Option[] {
  const gap = w(ctx, 'bargain.policy.gap');
  const none: Score = { value: 0, cost: 0 };
  switch (policy) {
    case 'declineAll':
      return [declineOption(offer, gap), ...offer.cards.map((c) => acceptOption(offer, c, none))];
    case 'acceptAll':
      // The first card wins by a gap; the rest and decline sit below it.
      return [
        declineOption(offer, 0),
        ...offer.cards.map((c, i) => acceptOption(offer, c, i === 0 ? { value: gap, cost: 0 } : none)),
      ];
    default: {
      const s = situation(ctx.p);
      const heal = Math.min(w(ctx, 'bargain.decline.heal'), s.missing) * w(ctx, 'bargain.unit.ancientHeal');
      return [
        declineOption(offer, w(ctx, 'bargain.decline.base') + heal),
        ...offer.cards.map((c) => acceptOption(offer, c, scoreCard(ctx, s, c))),
      ];
    }
  }
}

/** The deciding seat's bargain decisions under `policy` (`evaluate` scores cards, `declineAll`, `acceptAll`). */
export function bargainDecisions(ctx: BotCtx, policy: BargainBotPolicy): Decision[] {
  const offer = firstOffer(ctx.p);
  if (offer === undefined) {
    return [];
  }
  const options = optionsFor(ctx, offer, policy);
  return [{ id: 'bargain.offer', hero: benefiting(offer, options, ctx.me.id), options }];
}
