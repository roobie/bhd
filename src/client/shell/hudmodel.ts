// Pure: Perception + presentation + controls -> HudModel. Owner: w7-hud.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { HudInput, HudModel, Insets, Size } from './types.ts';

/**
 * The model for one HUD render. Kit-agnostic: ability buttons come from `HeroView.abilities` (one
 * button per entry, so `buttons.length === abilities.length`), resource bars from `resources`
 * (with `marks`), statuses from `statuses`; labels, glyphs and colours from content/presentation.ts
 * fallback lookups. Cooldown fractions are `cooldownLeft / cooldownTicks` (0 when no cooldown). All
 * fractions in [0, 1]. A slot in `driven` is badge 'you', else 'bot'. A dead hero (no perception
 * entry for its slot) is a `dead` card and `bar` is undefined when the selected hero is dead.
 * Never switches on hero, kit or effect names.
 */
export function buildHudModel(_input: HudInput): HudModel {
  throw new Error('not implemented');
}

/**
 * CSS pixels the HUD reserves in a viewport, given the safe-area insets: portrait reserves a
 * bottom band (ability bar, then hero cards) and a thin top bar; landscape a left column of hero
 * cards and a bottom-right ability cluster. The shell passes the result to `fitCamera`. Pure.
 */
export function hudInsets(_viewport: Size, safe: Insets): Insets {
  return safe;
}
