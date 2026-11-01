// Icon art as data: SVG path `d` strings on a 24x24 viewBox, single-colour silhouettes drawn with
// the even-odd fill rule (cut-outs are sub-paths inside the outline). Pure data, never hashed, the
// sim never reads it. The shell looks them up through presentation.ts and falls back to the glyph
// text when an id has none, so a new hero or status needs no client change.

const SHIELD = 'M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z';
const CROSSHAIR =
  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM11 6h2v5h-2zM11 13h2v5h-2zM6 11h5v2H6zM13 11h5v2h-5zM12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z';

/** Ability icons by perception `effect`. */
export const ABILITY_ICONS: Readonly<Record<string, string>> = {
  // A shield with an inner plate: planted and covered.
  brace: `${SHIELD}M12 6 7.6 7.7v3.4c0 2.9 1.8 5.4 4.4 6.7 2.6-1.3 4.4-3.8 4.4-6.7V7.7z`,
  // A cone of fire opening from the muzzle, with the heat inside.
  vent: 'M12 22 1.5 6.5C5 3.5 8.3 2 12 2s7 1.5 10.5 4.5zM12 17.5 7.6 8.6C9 7.8 10.4 7.5 12 7.5s3 .3 4.4 1.1z',
  // Three rounds fired in a spread.
  suppress:
    'M5.5 3c1.3 1.2 2 2.7 2 4.5V16h-4V7.5C3.5 5.7 4.2 4.2 5.5 3zM12 2c1.3 1.2 2 2.7 2 4.5V16h-4V6.5C10 4.7 10.7 3.2 12 2zM18.5 3c1.3 1.2 2 2.7 2 4.5V16h-4V7.5c0-1.8.7-3.3 2-4.5zM3.5 18h17v3h-17z',
  // A heart with a flame cut out of it.
  furnace:
    'M12 21 3.5 12.5C1 10 1.5 5.5 5 4.5c2.5-.7 5 .5 7 3 2-2.5 4.5-3.7 7-3 3.5 1 4 5.5 1.5 8zM12.4 9.5c.5 1.6 2.3 2.6 2.3 4.6a2.7 2.7 0 0 1-5.4 0c0-1 .5-1.8 1.1-2.4.1.9.4 1.4.9 1.5-.1-1.3-.1-2.7.5-3.7z',
  // A megaphone and its sound.
  taunt: 'M3 9h4l9-5v16l-9-5H3zM18.5 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2z',
  mark: CROSSHAIR,
  // A plain cross.
  heal: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  // Two arrows driving to the middle.
  pull: 'M1 10h5V6l5 6-5 6v-4H1zM23 10h-5V6l-5 6 5 6v-4h5z',
};

/** Status icons by status id. */
export const STATUS_ICONS: Readonly<Record<string, string>> = {
  // Two stacked down chevrons: slowed.
  suppressed: 'M4 3l8 8 8-8v4.5l-8 8-8-8zM4 11l8 8 8-8v4.5l-8 8-8-8z',
  marked: CROSSHAIR,
  // A shield split by a crack.
  exposed: `${SHIELD}M13.5 4.5 8.5 12.5H12L10.5 19.5 16 11h-3.5z`,
  // Three bodies pressed together.
  clumped:
    'M12 3a4.2 4.2 0 1 0 0 8.4A4.2 4.2 0 0 0 12 3zM7.2 12.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4zM16.8 12.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4z',
  // An exclamation mark: every eye on you.
  taunted: 'M10 2h4l-.8 12h-2.4zM12 17a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  // An arrow driven into the ground.
  rooted: 'M10 2h4v9h3.5L12 17 6.5 11H10zM3 19h18v3H3z',
};
