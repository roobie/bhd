// STUB (wave 10 step 1): in-memory signalling for tests and two tabs of one page. Slice A replaces
// the body; the signature is the contract. (ws.ts and broadcast.ts are slice A's too.)

import type { Signalling } from '../types.ts';

/** Peers created with the same `hub` and joining the same room see each other; the first to join is the host. */
export function createMemorySignalling(_hub: object, _id: string): Signalling {
  throw new Error('createMemorySignalling: not implemented (wave 10 slice A)');
}
