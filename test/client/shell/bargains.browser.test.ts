// The bargain panel in a real browser: cards and Decline dispatch the right UiAction, and a card
// whose resolution was sent is disabled.

import { expect, test as it } from 'vitest';
import { createHud } from '../../../src/client/shell/hud.ts';
import { buildHudModel } from '../../../src/client/shell/hudmodel.ts';
import type { UiAction } from '../../../src/client/shell/types.ts';
import { controls, hudInput, OFFER_ID, withOffer } from './bargain-fixture.ts';

function mount(sentCard: string | null) {
  const sent = sentCard === null ? [] : [{ offer: OFFER_ID, card: sentCard }];
  const model = buildHudModel(hudInput(withOffer(), { controls: { ...controls, bargainSent: sent } }));
  const root = document.createElement('div');
  document.body.append(root);
  const seen: UiAction[] = [];
  const hud = createHud(root, { dispatch: (a) => seen.push(a), mapPoint: (v) => v });
  hud.render(model);
  return { root, seen, hud };
}

it('cards and Decline dispatch bargain actions', () => {
  const { root, seen, hud } = mount(null);
  const cards = root.querySelectorAll<HTMLButtonElement>('button.bcard:not(.decline)');
  expect(cards.length).toBe(3);
  cards[1]?.click();
  root.querySelector<HTMLButtonElement>('button.bcard.decline')?.click();
  expect(seen[0]).toEqual({ kind: 'bargain', offer: OFFER_ID, card: cards[1]?.dataset.card });
  expect(seen[1]).toEqual({ kind: 'bargain', offer: OFFER_ID });
  expect(root.querySelector('.bpip')).not.toBeNull();
  hud.dispose();
  root.remove();
});

it('greys every button once a resolution was sent', () => {
  const { root, hud } = mount('blood-tithe');
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button.bcard')];
  expect(buttons.length).toBe(4);
  expect(buttons.every((b) => b.disabled)).toBe(true);
  expect(root.querySelector('.bcard.chosen')?.getAttribute('data-card')).toBe('blood-tithe');
  hud.dispose();
  root.remove();
});
