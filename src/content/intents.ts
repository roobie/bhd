// Intents board limits (wave w2-bots DESIGN "Intents board lives in the sim"). Authored in
// seconds; the board converts with `ticks()`. Owner: intents (tunables only).

export interface IntentsDef {
  /** A reservation's offset after the intent's fire tick may be at most this long. */
  readonly maxOffsetSeconds: number;
  /** Most intents live on the board at once; further `post` commands are logged no-ops. */
  readonly maxLive: number;
}

export function defaultIntents(): IntentsDef {
  return { maxOffsetSeconds: 5, maxLive: 8 };
}
