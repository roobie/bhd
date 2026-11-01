// play.html URL-hash configuration. Owner: w7-shell.
// STUB from the contracts slice: signatures are final, bodies are not written.
// Reuses the pure parsers `parseSeed` and `parseMode` of ../config.ts (the viewer's); the shell
// imports nothing else from the viewer.

import type { ShellConfig } from './types.ts';

export function defaultShellConfig(): ShellConfig {
  return { seed: 1, mode: 'director', drive: [0] };
}

/**
 * `#seed=1&mode=director&drive=0,3` -> ShellConfig. Invalid or missing fields fall back to the
 * defaults and it never throws. `drive`: comma list of slots 0-3 (deduplicated, ascending); an
 * explicitly empty `drive=` means watch (all bots); an absent `drive` means the default `[0]`.
 */
export function parseShellHash(_hash: string): ShellConfig {
  return defaultShellConfig();
}

/** The hash for a config (no leading '#'). `parseShellHash(serialiseShellHash(c))` equals `c`. */
export function serialiseShellHash(_c: ShellConfig): string {
  throw new Error('not implemented');
}
