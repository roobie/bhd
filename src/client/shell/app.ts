// The shell: wires the match, the frame loop, renderer, input and HUD. Owner: w7-shell.
// STUB from the contracts slice: signatures are final; the body only shows a placeholder.
//
// Contract: builds the match through `buildMatch` (match/run.ts) with `humans: config.drive`;
// creates `localSink(match, INPUT_DELAY_TICKS)` unless `options.sink` is given; each animation frame
// runs `planFrame`, steps the match `steps` times (snapshot after each, effects advanced from the
// events), draws `interpolate(prev, curr, alpha)` through `buildScene` and the renderer, and
// re-renders the HUD at most once per sim tick. Actions go through `reduce`; its commands are
// submitted as player = the driven slot (the hero's slot) through the sink. `performance.now` is
// read here and nowhere else; real time never reaches the sim. Without WebGL2 (`createRenderer`
// returns undefined) it shows a message with a link to index.html and runs no loop
// (`rendering` false). `restart` rebuilds the match.

import type { ShellConfig, ShellElements, ShellHandle, ShellOptions } from './types.ts';

export function mountShell(els: ShellElements, _config: ShellConfig, _options?: ShellOptions): ShellHandle {
  els.hud.textContent = 'BHD shell: not implemented yet (wave 7 stub)';
  return {
    match: () => {
      throw new Error('not implemented');
    },
    controls: () => {
      throw new Error('not implemented');
    },
    dispatch: () => undefined,
    rendering: false,
    dispose: () => undefined,
  };
}
