// HUD smoke test in a real browser: createHud renders a model and buttons dispatch actions.

import { expect, test as it } from 'vitest';
import { createHud } from '../../../src/client/shell/hud.ts';
import { buildHudModel } from '../../../src/client/shell/hudmodel.ts';
import type { UiAction } from '../../../src/client/shell/types.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import { Sim } from '../../../src/sim/sim.ts';

it('hud renders cards and ability buttons, and a click dispatches', () => {
  const p = perceive(new Sim({ seed: 1, game: defaultGame() }), createMemory(defaultPerception()));
  const model = buildHudModel({
    p,
    ui: defaultPresentation(),
    controls: {
      selected: 0,
      aim: undefined,
      cursor: undefined,
      arming: {
        armOn: false,
        phase: 'off',
        slot: -1,
        x: 0,
        y: 0,
        fireHalfSeconds: 4,
        intent: 0,
        offsetHalfSeconds: 0,
        lastPost: undefined,
      },
      paused: false,
      hint: undefined,
    },
    driven: [0],
    maxOffsetSeconds: 5,
    end: undefined,
  });
  const root = document.createElement('div');
  document.body.append(root);
  const seen: UiAction[] = [];
  const hud = createHud(root, { dispatch: (a) => seen.push(a), mapPoint: (v) => v });
  hud.render(model);
  expect(root.querySelectorAll('.card').length).toBe(4);
  const buttons = root.querySelectorAll<HTMLButtonElement>('button.ability');
  expect(buttons.length).toBe(model.bar?.buttons.length);
  buttons[0]?.click();
  root.querySelectorAll<HTMLButtonElement>('button.card')[1]?.click();
  expect(seen[0]).toEqual({ kind: 'cast', slot: model.bar?.buttons[0]?.slot });
  expect(seen[1]).toEqual({ kind: 'select', slot: 1 });
  hud.dispose();
  expect(root.querySelector('.card')).toBeNull();
  root.remove();
});
