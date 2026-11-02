// Networked-play invariants of the shell (wave 10 E2): step gating, ownership, panels. No gameplay numbers.

import { describe, expect, it } from 'vitest';
import { initialControls, reduce } from '../../../src/client/shell/controls.ts';
import { CATCH_UP_LAG, CATCH_UP_MAX_EXTRA, stepBudget } from '../../../src/client/shell/frame.ts';
import { buildHudModel } from '../../../src/client/shell/hudmodel.ts';
import type { ControlContext, DriverInfo, HudNetInput, NetNotice } from '../../../src/client/shell/types.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { cardsFor, hudInput, OFFER_ID, withOffer } from './bargain-fixture.ts';

const p = withOffer();
const heroIds = p.heroes.map((h) => h.id);

function net(
  status: HudNetInput['status'],
  info: DriverInfo = {},
  notices: NetNotice[] = [],
  canDump = true,
): HudNetInput {
  return { status, info, canDump, notices };
}

describe('stepBudget', () => {
  it('never catches up without a limit (solo)', () => {
    expect(stepBudget(2, 100, Number.POSITIVE_INFINITY)).toBe(2);
  });

  it('is capped by the ticks available', () => {
    expect(stepBudget(3, 10, 11)).toBe(1);
    expect(stepBudget(3, 10, 10)).toBe(0);
    expect(stepBudget(3, 10, 5)).toBe(0);
  });

  it('adds steps only when behind by more than the lag, with a bound', () => {
    expect(stepBudget(1, 0, CATCH_UP_LAG)).toBe(1);
    expect(stepBudget(1, 0, CATCH_UP_LAG + 3)).toBe(4);
    expect(stepBudget(1, 0, 10_000)).toBe(1 + CATCH_UP_MAX_EXTRA);
  });
});

describe('ownership in the HUD model', () => {
  it('badges another human differently and names them', () => {
    const m = buildHudModel(hudInput(p, { driven: [0], others: [1], names: ['Ann', 'Bo'] }));
    expect(m.heroes.map((h) => h.badge)).toEqual(['you', 'other', 'bot', 'bot']);
    expect(m.heroes[1]?.badgeLabel).toBe('Bo');
  });

  it('solo has no other badge', () => {
    expect(buildHudModel(hudInput(p)).heroes.map((h) => h.badge)).toEqual(['you', 'bot', 'bot', 'bot']);
  });

  it('marks cards bound to another human theirs, leaves bot, team and Decline alone', () => {
    // The fixture's hero card is bound to the hero in slot 0.
    const mine = buildHudModel(hudInput(p, { driven: [1], others: [0], coop: true })).bargain?.offers[0];
    expect(mine?.cards.map((c) => c.theirs === true)).toEqual([true, false, false]);
    const bot = buildHudModel(hudInput(p, { driven: [1], others: [2], coop: true })).bargain?.offers[0];
    expect(bot?.cards.some((c) => c.theirs === true)).toBe(false);
    expect(bot?.enabled).toBe(true);
  });

  it('hides the bots-pick toggle in co-op and keeps the offer clickable even if the toggle was on', () => {
    const coop = buildHudModel(hudInput(p, { coop: true, botsPick: true })).bargain;
    expect(coop?.botsPickHidden).toBe(true);
    expect(coop?.offers[0]?.enabled).toBe(true);
    const solo = buildHudModel(hudInput(p)).bargain;
    expect(solo?.botsPickHidden).toBeUndefined();
  });
});

describe('the reducer refuses another human hero card', () => {
  const ctx = (lockedHeroes: readonly number[]): ControlContext => ({
    p,
    driven: [1],
    ui: defaultPresentation(),
    maxOffsetSeconds: 5,
    lockedHeroes,
  });
  const cards = cardsFor(heroIds[0] ?? 1);
  const heroCard = cards[0]?.bargain ?? '';
  const teamCard = cards[1]?.bargain ?? '';

  it('emits nothing for a locked hero card and marks nothing sent', () => {
    const r = reduce(initialControls(1), { kind: 'bargain', offer: OFFER_ID, card: heroCard }, ctx([heroIds[0] ?? 1]));
    expect(r.commands).toEqual([]);
    expect(r.state.bargainSent ?? []).toEqual([]);
  });

  it('still emits for a team card, Decline and an unlocked hero card', () => {
    expect(
      reduce(initialControls(1), { kind: 'bargain', offer: OFFER_ID, card: teamCard }, ctx([heroIds[0] ?? 1])).commands,
    ).toHaveLength(1);
    expect(
      reduce(initialControls(1), { kind: 'bargain', offer: OFFER_ID }, ctx([heroIds[0] ?? 1])).commands,
    ).toHaveLength(1);
    expect(
      reduce(initialControls(1), { kind: 'bargain', offer: OFFER_ID, card: heroCard }, ctx([])).commands,
    ).toHaveLength(1);
  });
});

describe('net panel', () => {
  it('is absent in solo and when running quietly', () => {
    expect(buildHudModel(hudInput(p)).net).toBeUndefined();
    expect(buildHudModel(hudInput(p, { net: net('running') })).net).toBeUndefined();
  });

  it('shows stalled, desynced (with the dump button only if the driver can dump) and ended', () => {
    expect(buildHudModel(hudInput(p, { net: net('stalled') })).net?.kind).toBe('stalled');
    const d = buildHudModel(hudInput(p, { net: net('desynced') })).net;
    expect(d?.kind).toBe('desynced');
    expect(d?.dump).toBe(true);
    expect(buildHudModel(hudInput(p, { net: net('desynced', {}, [], false) })).net?.dump).toBe(false);
    const e = buildHudModel(hudInput(p, { net: net('ended', { endedBy: 'host-left' }) })).net;
    expect(e?.kind).toBe('ended');
    expect(e?.title.toLowerCase()).toContain('host');
  });

  it('names who paused and flags the top bar paused', () => {
    const m = buildHudModel(hudInput(p, { names: ['Ann', 'Bo'], net: net('paused', { pausedBy: 1 }) }));
    expect(m.net?.title).toContain('Bo');
    expect(m.top.paused).toBe(true);
  });

  it('names who called a wave and which slot dropped', () => {
    const m = buildHudModel(
      hudInput(p, {
        names: ['Ann', 'Bo'],
        net: net('running', {}, [
          { kind: 'call', slot: 0 },
          { kind: 'drop', slot: 1 },
        ]),
      }),
    );
    expect(m.net?.kind).toBeUndefined();
    expect(m.net?.notes[0]).toContain('Ann');
    expect(m.net?.notes[0]).toContain('called');
    expect(m.net?.notes[1]).toContain('Bo');
    expect(m.net?.notes[1]).toContain('bot');
  });

  it('leaves the end overlay alone when the match itself ended', () => {
    const m = buildHudModel(hudInput(p, { end: { reason: 'victory', wave: 3 }, net: net('ended') }));
    expect(m.net).toBeUndefined();
  });
});
