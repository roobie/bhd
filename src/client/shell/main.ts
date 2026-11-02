// Browser entry of play.html. Owner: w7-shell.
// No `room` in the URL: solo play. `#room=CODE` (or `local-NAME` for two tabs of one browser) plays
// co-op through coop.ts. `#room=new` makes a fresh code first (the signalling worker's `/new`, or a
// `local-*` code when no signalling server is configured).

import { mountShell } from './app.ts';
import { parseRoomConfig, parseShellHash, parseSignalOrigin, signalOrigin } from './config.ts';
import { mountCoop } from './coop.ts';
import { createFeedback } from './feedback.ts';
import { makeRoomCode } from './lobbystate.ts';

const HASH_PREFIX = /^#/u;
const WS_PREFIX = /^ws/u;

/** The signalling origin: `#signal=` wins over the build's `VITE_BHD_SIGNAL`; absent by default. */
function configuredOrigin(): string | undefined {
  const fromBuild = import.meta.env.VITE_BHD_SIGNAL;
  return (
    parseSignalOrigin(globalThis.location.hash, globalThis.location.search) ??
    (typeof fromBuild === 'string' ? signalOrigin(fromBuild) : undefined)
  );
}

/** Replaces `room=new` in the URL with a fresh code and returns the new hash. */
async function resolveNewRoom(origin: string | undefined): Promise<void> {
  const params = new URLSearchParams(globalThis.location.hash.replace(HASH_PREFIX, ''));
  if (params.get('room')?.toLowerCase() !== 'new') {
    return;
  }
  let code = `local-${makeRoomCode(Math.random).toLowerCase()}${makeRoomCode(Math.random).toLowerCase()}`;
  if (origin !== undefined) {
    try {
      const res = await fetch(`${origin.replace(WS_PREFIX, 'http')}/new`);
      const body = (await res.json()) as { room?: unknown };
      if (typeof body.room === 'string') {
        code = body.room;
      }
    } catch {
      // Keep the local code: the page then explains what failed.
    }
  }
  params.set('room', code);
  globalThis.history.replaceState(null, '', `#${params.toString()}`);
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const hud = document.querySelector<HTMLElement>('#hud');
  if (!(canvas && hud)) {
    return;
  }
  const origin = configuredOrigin();
  await resolveNewRoom(origin);
  const { room, name } = parseRoomConfig(globalThis.location.hash, globalThis.location.search);
  const lobbyRoot = document.querySelector<HTMLElement>('#lobby');
  if (room === undefined || lobbyRoot === null) {
    mountShell({ canvas, hud }, parseShellHash(globalThis.location.hash), { feedback: createFeedback() });
    return;
  }
  const coop = mountCoop({
    els: { canvas, hud },
    lobbyRoot,
    room,
    name,
    signalOrigin: origin,
    fingerprint: __BHD_FINGERPRINT__,
    feedback: createFeedback,
    // Automation hook (the two-tab test reads the driver log through it).
    onGame: (game) => {
      (globalThis as { __bhdCoop?: unknown }).__bhdCoop = game;
    },
  });
  await coop.ready;
}

main().catch(() => undefined);
