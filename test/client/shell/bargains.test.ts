// Bargain HUD invariants (D-4E4QRJ7N6LIGZDSD): card text is generated and clean, the key and click
// paths emit the right command and UiAction, a sent card is greyed. No tuned numbers asserted.

import { describe, expect, it } from 'vitest';
import { initialControls, reduce } from '../../../src/client/shell/controls.ts';
import { buildHudModel } from '../../../src/client/shell/hudmodel.ts';
import { BARGAIN_CARD_KEYS, KEY_BARGAIN_DECLINE, keyAction } from '../../../src/client/shell/input.ts';
import type { ControlContext, UiAction } from '../../../src/client/shell/types.ts';
import { describeBargain, effectiveHeroDef } from '../../../src/content/help.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { isValidCommand } from '../../../src/sim/commands.ts';
import { cardsFor, controls, hudInput, OFFER_ID, WINDOW_SECONDS, withOffer } from './bargain-fixture.ts';

const BAD = /NaN|undefined|\?|\{|\}|Infinity/u;
const p = withOffer();
const ctx = (driven: readonly number[] = [0]): ControlContext => ({
  p,
  driven,
  ui: defaultPresentation(),
  maxOffsetSeconds: 5,
});

describe('bargain model', () => {
  it('is absent without an open offer', () => {
    const none = { ...p, bargains: { open: [], taken: p.bargains.taken } };
    expect(buildHudModel(hudInput(none)).bargain).toBeUndefined();
  });

  it('shows every card with one gain and one cost line per effect and no junk in the text', () => {
    const offer = buildHudModel(hudInput(p)).bargain?.offers[0];
    expect(offer?.offer).toBe(OFFER_ID);
    const views = p.bargains.open[0]?.cards ?? [];
    expect(offer?.cards.length).toBe(views.length);
    offer?.cards.forEach((card, i) => {
      expect(card.gains.length).toBe(views[i]?.gains.length);
      expect(card.costs.length).toBe(views[i]?.costs.length);
      for (const text of [card.label, card.who, ...card.gains, ...card.costs]) {
        expect(text).not.toBe('');
        expect(text).not.toMatch(BAD);
      }
    });
    expect(offer?.declineReward).not.toMatch(BAD);
    expect(offer?.declineReward).not.toBe('');
  });

  it('counts down in range and tolerates a lapsed offer', () => {
    for (const s of [WINDOW_SECONDS, 7.3, 0, -3]) {
      const offer = buildHudModel(hudInput(withOffer(s))).bargain?.offers[0];
      expect(Number.isInteger(offer?.secondsLeft)).toBe(true);
      expect(offer?.secondsLeft).toBeGreaterThanOrEqual(0);
      expect(offer?.frac).toBeGreaterThanOrEqual(0);
      expect(offer?.frac).toBeLessThanOrEqual(1);
    }
  });

  it('marks the chosen card and greys the offer once a resolution was sent', () => {
    const sent = { ...controls, bargainSent: [{ offer: OFFER_ID, card: 'blood-tithe' }] };
    const offer = buildHudModel(hudInput(p, { controls: sent })).bargain?.offers[0];
    expect(offer?.inFlight).toBe(true);
    expect(offer?.cards.filter((c) => c.chosen).map((c) => c.id)).toEqual(['blood-tithe']);
    const declined = { ...controls, bargainSent: [{ offer: OFFER_ID }] };
    const d = buildHudModel(hudInput(p, { controls: declined })).bargain?.offers[0];
    expect(d?.declined).toBe(true);
    expect(d?.cards.some((c) => c.chosen)).toBe(false);
  });

  it('is not enabled without a driven hero', () => {
    expect(buildHudModel(hudInput(p, { driven: [] })).bargain?.offers[0]?.enabled).toBe(false);
  });

  it('puts a pip with a readable tooltip on the hero cards that carry a bargain', () => {
    const cards = buildHudModel(hudInput(p)).heroes;
    const pips = cards[0]?.bargains ?? [];
    expect(pips.length).toBe(p.heroes[0]?.bargains.length);
    for (const pip of pips) {
      expect(pip.tooltip).not.toMatch(BAD);
      expect(pip.tooltip.split('\n').length).toBeGreaterThan(1);
    }
    expect(cards[1]?.bargains ?? []).toEqual([]);
  });
});

describe('bargain help', () => {
  it('has a Bargains section from the config and lists what was accepted', () => {
    const m = buildHudModel(hudInput(p, { controls: { ...controls, help: true } }));
    const section = m.help?.bargains;
    expect(section?.notes.length).toBeGreaterThan(0);
    for (const [title, text] of section?.notes ?? []) {
      expect(`${title} ${text}`).not.toMatch(BAD);
    }
    expect(section?.taken.length).toBe(p.bargains.taken.length);
  });

  it('has no Bargains section when the game has none', () => {
    const { game: _game, ...noGame } = hudInput(p, { controls: { ...controls, help: true } });
    const m = buildHudModel(noGame);
    expect(m.help?.bargains).toBeUndefined();
  });

  it('describeBargain is pure over the effect values', () => {
    const facts = { scope: 'hero' as const, enemy: (id: string) => id };
    const [card] = cardsFor(1);
    if (card === undefined) {
      throw new Error('fixture has no card');
    }
    expect(describeBargain(card, facts)).toEqual(describeBargain(card, facts));
  });

  it('effectiveHeroDef leaves the def alone for a hero without bargains', () => {
    const [, hero] = p.heroes;
    const def = { id: 'x' } as never;
    expect(effectiveHeroDef(def, p.bargains.taken, hero)).toBe(def);
    expect(effectiveHeroDef(undefined, p.bargains.taken, p.heroes[0])).toBeUndefined();
  });
});

describe('bargain keys and clicks', () => {
  const key = (k: string) => keyAction({ key: k, ctrl: false, alt: false, shift: false }, controls);

  it('keys map to bargainKey and clash with no other binding', () => {
    BARGAIN_CARD_KEYS.forEach((k, i) => {
      expect(key(k)).toEqual({ kind: 'bargainKey', card: i });
      expect(key(k.toLowerCase())).toEqual({ kind: 'bargainKey', card: i });
    });
    expect(key(KEY_BARGAIN_DECLINE)).toEqual({ kind: 'bargainKey' });
    for (const other of ['q', 'w', 'e', 'r', 's', 'f', 'n', 'h', 'p', '1', '2', '3', '4']) {
      expect(key(other)?.kind).not.toBe('bargainKey');
    }
  });

  it('a card click sends one valid accept and marks it sent', () => {
    const action: UiAction = { kind: 'bargain', offer: OFFER_ID, card: 'unvented-barrel' };
    const r = reduce(initialControls(0), action, ctx());
    expect(r.commands).toEqual([{ kind: 'bargain', op: 'accept', offer: OFFER_ID, card: 'unvented-barrel' }]);
    expect(r.commands.every(isValidCommand)).toBe(true);
    expect(r.state.bargainSent).toEqual([{ offer: OFFER_ID, card: 'unvented-barrel' }]);
  });

  it('Decline sends a valid decline', () => {
    const r = reduce(initialControls(0), { kind: 'bargain', offer: OFFER_ID }, ctx());
    expect(r.commands).toEqual([{ kind: 'bargain', op: 'decline', offer: OFFER_ID }]);
    expect(r.commands.every(isValidCommand)).toBe(true);
  });

  it('the keys resolve the open offer by card index and by decline', () => {
    const second = reduce(initialControls(0), { kind: 'bargainKey', card: 1 }, ctx());
    expect(second.commands).toEqual([{ kind: 'bargain', op: 'accept', offer: OFFER_ID, card: 'call-the-horde' }]);
    const decline = reduce(initialControls(0), { kind: 'bargainKey' }, ctx());
    expect(decline.commands).toEqual([{ kind: 'bargain', op: 'decline', offer: OFFER_ID }]);
  });

  it('sends once per offer: a second click or key while in flight emits nothing', () => {
    const first = reduce(initialControls(0), { kind: 'bargainKey', card: 0 }, ctx());
    const again = reduce(first.state, { kind: 'bargain', offer: OFFER_ID }, ctx());
    const key2 = reduce(first.state, { kind: 'bargainKey', card: 1 }, ctx());
    expect(again.commands).toEqual([]);
    expect(key2.commands).toEqual([]);
  });

  it('ignores an unknown offer or card, a missing card index, and a watcher', () => {
    const c = initialControls(0);
    expect(reduce(c, { kind: 'bargain', offer: 999 }, ctx()).commands).toEqual([]);
    expect(reduce(c, { kind: 'bargain', offer: OFFER_ID, card: 'nope' }, ctx()).commands).toEqual([]);
    expect(reduce(c, { kind: 'bargainKey', card: 9 }, ctx()).commands).toEqual([]);
    expect(reduce(c, { kind: 'bargain', offer: OFFER_ID }, ctx([])).commands).toEqual([]);
  });

  it('forgets sent offers that are no longer open', () => {
    const sent = { ...initialControls(0), bargainSent: [{ offer: 1 }] };
    const r = reduce(sent, { kind: 'bargain', offer: 999 }, ctx());
    expect(r.state.bargainSent).toEqual([]);
  });
});
