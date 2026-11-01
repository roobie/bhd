// Icon art as data: SVG path `d` strings on a 24x24 viewBox, single-colour silhouettes drawn with
// the even-odd fill rule (cut-outs are sub-paths inside the outline). Pure data, never hashed, the
// sim never reads it. The shell looks them up through presentation.ts and falls back to the glyph
// text when an id has none, so a new hero or status needs no client change.

const SHIELD = 'M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z';
const CROSSHAIR =
  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM11 6h2v5h-2zM11 13h2v5h-2zM6 11h5v2H6zM13 11h5v2h-5zM12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z';

const MARTYRDOM =
  'M12 .5l2.8 4.8 5.3-1.4-1.4 5.3 4.8 2.8-4.8 2.8 1.4 5.3-5.3-1.4L12 23.5l-2.8-4.8-5.3 1.4 1.4-5.3L.5 12l4.8-2.8-1.4-5.3 5.3 1.4zM10.5 6h3v4.5H18v3h-4.5V18h-3v-4.5H6v-3h4.5z';

/** Ability icons by perception `effect`. */
export const ABILITY_ICONS: Readonly<Record<string, string>> = {
  // A shield with an inner plate: planted and covered.
  brace: `${SHIELD}M12 6 7.6 7.7v3.4c0 2.9 1.8 5.4 4.4 6.7 2.6-1.3 4.4-3.8 4.4-6.7V7.7z`,
  // A cone of fire opening from the muzzle, with the heat inside.
  vent: 'M12 22 1.5 6.5C5 3.5 8.3 2 12 2s7 1.5 10.5 4.5zM12 17.5 7.6 8.6C9 7.8 10.4 7.5 12 7.5s3 .3 4.4 1.1z',
  // A tall pointed pavise on a prop-stand, a boss stud in its face.
  pavise:
    'M12 1 4.5 3.6v10L12 19l7.5-5.4v-10zM12 4 7 5.6v7.1l5 3.6 5-3.6V5.6zM12 8.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10.5 19h3v3h-3zM6 21h12v2H6z',
  // A heart with a flame cut out of it.
  furnace:
    'M12 21 3.5 12.5C1 10 1.5 5.5 5 4.5c2.5-.7 5 .5 7 3 2-2.5 4.5-3.7 7-3 3.5 1 4 5.5 1.5 8zM12.4 9.5c.5 1.6 2.3 2.6 2.3 4.6a2.7 2.7 0 0 1-5.4 0c0-1 .5-1.8 1.1-2.4.1.9.4 1.4.9 1.5-.1-1.3-.1-2.7.5-3.7z',
  // A megaphone and its sound.
  taunt: 'M3 9h4l9-5v16l-9-5H3zM18.5 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2z',
  mark: CROSSHAIR,
  // A plain cross.
  heal: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  // A taut chain of three diamond links, spiked at both ends.
  chain:
    'M5 1l1.5 3L9.6 5.4 11 8.5 8 10 5 8.7 3.2 6zM6.5 4 8 6.5 6.5 8.6 5 6.5zM19 23l-1.5-3-3.1-1.4L13 15.5 16 14l3 1.3 1.8 2.7zM17.5 20 16 17.5l1.5-2.1L19 17.5zM12 7.5l4.5 4.5-4.5 4.5L7.5 12zM12 10.4 10.4 12l1.6 1.6 1.6-1.6z',
  // A radiant burst around a cross: the saint who burns for the others.
  martyrdom: MARTYRDOM,
  // A spiral drawn inward.
  lash: 'M12 3a9 9 0 1 0 9 9h-2.5A6.5 6.5 0 1 1 12 5.5V3zM12 8a4 4 0 1 0 4 4h-2.2A1.8 1.8 0 1 1 12 10.2zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
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
  // Spent: a burnt-out ring struck through.
  spent: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM5.4 17.4l12-12 1.6 1.6-12 12z',
  // Martyrdom active: the same burst as the ability.
  martyrdom: MARTYRDOM,
  // Discharge: a bolt of warp tearing out of him.
  discharge: 'M14 1 4 13.5h6L8.5 23 20 9.5h-6.5zM21 2l-1 3 3 1zM2 20l3-1-1-3z',
};

/** Icons for the non-ability controls and states, by id. */
export const UI_ICONS: Readonly<Record<string, string>> = {
  // Two forward triangles and a stop bar: send the next wave now.
  callWave: 'M2 5l9 7-9 7zM11 5l9 7-9 7zM21 5h2v14h-2z',
  // A tombstone with a cross cut into it.
  fallen: 'M5 22V10a7 7 0 0 1 14 0v12zM11 7h2v3h3v2h-3v5h-2v-5H8v-2h3z',
};
