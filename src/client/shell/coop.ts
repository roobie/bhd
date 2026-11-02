// Co-op wiring (wave 10 integration): a room in the URL turns play.html into the lobby, then the
// lockstep game. Solo play never loads this (main.ts only calls it when `room` is set).
//
//   signalling (broadcast for `local-*` rooms, else ws against a configured origin)
//     -> join -> RTC transport -> lobby (picks, host starts) -> start { spec, seats, delay }
//     -> buildMatch(spec) + netDriver -> mountShell (localPlayers, humanSlots, names, onRestart)
//     -> restart: `end` -> everyone returns to a fresh lobby over the same links.
//
// While a game runs the host answers a late `hello` with `refuse {started}`; the transport, the
// signalling and the room stay up across games.

import { netDriver } from '../../net/driver.ts';
import { createRtcTransport } from '../../net/rtc.ts';
import { createBroadcastSignalling, isLocalRoom } from '../../net/signal/broadcast.ts';
import { createWsSignalling } from '../../net/signal/ws.ts';
import type { IceServer, PeerId, Signalling, Transport, WireMsg } from '../../net/types.ts';
import { mountShell } from './app.ts';
import type { FeedbackSink } from './feedbackSink.ts';
import { type LobbyHandle, mountLobby } from './lobby.ts';
import { createBackgroundSchedule } from './schedule.ts';
import type { ShellElements, ShellHandle } from './types.ts';

type Start = Extract<WireMsg, { t: 'start' }>;

export interface CoopDeps {
  readonly els: ShellElements;
  /** The lobby overlay (`#lobby` in play.html). */
  readonly lobbyRoot: HTMLElement;
  readonly room: string;
  readonly name: string;
  /** The signalling server origin; absent means only `local-*` rooms work. */
  readonly signalOrigin: string | undefined;
  /** Build identity for the lobby `hello`. */
  readonly fingerprint: string;
  /** Creates the feedback layer (callouts, sound) once, on the first game. */
  readonly feedback?: () => FeedbackSink;
  /** Milliseconds clock; default `performance.now`. */
  readonly now?: () => number;
  /** Test and automation hook: called with the live shell and driver of each game. */
  readonly onGame?: (game: {
    readonly shell: ShellHandle;
    readonly driver: ReturnType<ReturnType<typeof netDriver>>;
  }) => void;
  /** Test hook: replaces the transport factory. */
  readonly createTransport?: (
    self: PeerId,
    host: PeerId,
    signalling: Signalling,
    ice: readonly IceServer[],
  ) => Transport;
}

export interface CoopHandle {
  /** Resolves once connected and the lobby is up (or the failure is shown). */
  readonly ready: Promise<void>;
  dispose: () => void;
}

const NO_SIGNAL =
  'No signalling server is configured for this build, so only local rooms (room=local-NAME, two tabs of one browser) work. ' +
  'Set VITE_BHD_SIGNAL at build time or open the page with #signal=https://your-worker.example.';

/** A peer whose link is up but that never got into the lobby is dropped after this long (M3). */
const ACCEPT_GRACE_MS = 10_000;

/** Broadcast signalling for local rooms; otherwise the ws server at `origin` (its `joined` carries the ICE servers). */
function openSignalling(room: string, origin: string | undefined): Signalling {
  return isLocalRoom(room) || origin === undefined ? createBroadcastSignalling() : createWsSignalling(origin);
}

/** The display name of each hero slot's player, from the lobby's names. */
function slotNames(start: Start, known: ReadonlyMap<PeerId, string>): string[] {
  const names: string[] = ['', '', '', ''];
  for (const seat of start.seats) {
    for (const slot of seat.players) {
      names[slot] = known.get(seat.peer) ?? `Player ${slot + 1}`;
    }
  }
  return names;
}

function showError(root: HTMLElement, title: string, message: string): void {
  root.hidden = false;
  const section = document.createElement('section');
  section.className = 'lobby lerror';
  section.setAttribute('role', 'alert');
  const h = document.createElement('h1');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  const back = document.createElement('p');
  const a = document.createElement('a');
  a.href = 'index.html';
  a.textContent = 'Back to the menu';
  back.append(a);
  section.append(h, p, back);
  root.replaceChildren(section);
}

export function mountCoop(deps: CoopDeps): CoopHandle {
  const now = deps.now ?? (() => performance.now());
  const connected = new Set<PeerId>();
  const background = createBackgroundSchedule();
  let signalling: Signalling | undefined;
  let transport: Transport | undefined;
  let self: PeerId = '';
  let host: PeerId = '';
  let phase: 'connecting' | 'lobby' | 'game' | 'closed' = 'connecting';
  let lobby: LobbyHandle | undefined;
  let shell: ShellHandle | undefined;
  let feedback: FeedbackSink | undefined;
  let { canvas, hud } = deps.els;
  let games = 0;
  /** Host: the peers seated in the running game; only they may end it. */
  let seated = new Set<PeerId>();
  const graceTimers = new Map<PeerId, ReturnType<typeof setTimeout>>();

  function kick(peer: PeerId): void {
    transport?.disconnect?.(peer);
  }

  /** Host: a peer that is connected but not accepted into the lobby soon is cut loose. */
  function watchAcceptance(peer: PeerId): void {
    clearTimeout(graceTimers.get(peer));
    graceTimers.set(
      peer,
      setTimeout(() => {
        graceTimers.delete(peer);
        if (phase === 'lobby' && connected.has(peer) && lobby?.lobby.view().names.has(peer) !== true) {
          kick(peer);
        }
      }, ACCEPT_GRACE_MS),
    );
  }

  function enterLobby(): void {
    const t = transport;
    if (t === undefined) {
      return;
    }
    phase = 'lobby';
    deps.lobbyRoot.hidden = false;
    lobby = mountLobby(deps.lobbyRoot, {
      room: deps.room,
      self,
      host,
      name: deps.name,
      fingerprint: deps.fingerprint,
      send: (peer, msg) => t.send(peer, msg),
      broadcast: (msg) => t.broadcast(msg),
      kick,
    });
    lobby.onStart((start) => startGame(start));
    for (const peer of connected) {
      lobby.peerUp(peer);
      if (self === host) {
        watchAcceptance(peer);
      }
    }
  }

  /**
   * Fresh canvas and HUD root for every game after the first: a WebGL context is not reused across
   * shells, and lit keeps its render state on the root element it was given.
   */
  function freshElements(): ShellElements {
    if (games > 0) {
      const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(nextCanvas);
      canvas = nextCanvas;
      const nextHud = hud.cloneNode(false) as HTMLElement;
      hud.replaceWith(nextHud);
      hud = nextHud;
    }
    games += 1;
    return { canvas, hud };
  }

  function startGame(start: Start): void {
    const t = transport;
    const view = lobby?.lobby.view();
    if (t === undefined || view === undefined) {
      return;
    }
    const names = slotNames(start, view.names);
    lobby?.dispose();
    lobby = undefined;
    deps.lobbyRoot.hidden = true;
    phase = 'game';
    seated = new Set(start.seats.map((s) => s.peer));
    const spec = { ...start.spec, networked: true };
    const humans = spec.humans ?? [];
    const mine = start.seats.find((s) => s.peer === self)?.players ?? [];
    feedback ??= deps.feedback?.();
    const make = netDriver({ transport: t, start: { ...start, spec }, host, now });
    let driver: ReturnType<typeof make> | undefined;
    const opened = mountShell(
      freshElements(),
      { seed: spec.seed, mode: spec.mode, drive: humans },
      {
        spec,
        driver: (match) => {
          driver = make(match);
          return driver;
        },
        localPlayers: mine,
        humanSlots: humans,
        names,
        now,
        schedule: background.schedule,
        // Restart in co-op returns everyone to a fresh lobby; defer so the shell is not torn down mid-dispatch.
        onRestart: () => {
          queueMicrotask(requestRestart);
          return true;
        },
        ...(feedback === undefined ? {} : { feedback }),
      },
    );
    shell = opened;
    if (driver !== undefined) {
      deps.onGame?.({ shell: opened, driver });
    }
    if (!opened.rendering) {
      leaveUnplayable(t, driver);
    }
  }

  /** No WebGL: this peer cannot play, so it leaves the game rather than stall the others (L2). */
  function leaveUnplayable(t: Transport, driver: { dispose: () => void } | undefined): void {
    if (driver !== undefined) {
      driver.dispose();
    } else if (self === host) {
      t.broadcast({ t: 'bye' });
    } else {
      t.send(host, { t: 'bye' });
    }
  }

  /** Host: end the game for everyone. A client asks the host to. */
  function requestRestart(): void {
    const t = transport;
    if (t === undefined || phase !== 'game') {
      return;
    }
    if (self === host) {
      backToLobby(true);
    } else if (connected.has(host)) {
      t.send(host, { t: 'end' });
    } else {
      closeGame();
      showError(deps.lobbyRoot, 'Disconnected', 'The host left the room.');
    }
  }

  function closeGame(): void {
    shell?.dispose();
    shell = undefined;
  }

  function backToLobby(tell: boolean): void {
    if (phase !== 'game') {
      return;
    }
    if (tell) {
      transport?.broadcast({ t: 'end' });
    }
    closeGame();
    enterLobby();
  }

  function onMessage(from: PeerId, msg: WireMsg): void {
    if (msg.t === 'end') {
      // The host honours `end` only from a seated peer; a client only from the host (M3).
      if (phase === 'game' && (self === host ? seated.has(from) : from === host)) {
        backToLobby(self === host);
      }
    } else if (phase === 'lobby') {
      lobby?.receive(from, msg);
    } else if (phase === 'game' && self === host && msg.t === 'hello') {
      transport?.send(from, { t: 'refuse', reason: 'started' });
    }
  }

  function onPeer(peer: PeerId, state: 'up' | 'down'): void {
    if (state === 'up') {
      connected.add(peer);
      if (self === host && phase === 'lobby') {
        watchAcceptance(peer);
      }
    } else {
      connected.delete(peer);
      clearTimeout(graceTimers.get(peer));
      graceTimers.delete(peer);
    }
    if (phase === 'lobby') {
      if (state === 'up') {
        lobby?.peerUp(peer);
      } else {
        lobby?.peerDown(peer);
      }
    }
  }

  async function connect(): Promise<void> {
    deps.lobbyRoot.hidden = false;
    const local = isLocalRoom(deps.room);
    if (!local && deps.signalOrigin === undefined) {
      showError(deps.lobbyRoot, 'No signalling server', NO_SIGNAL);
      phase = 'closed';
      return;
    }
    try {
      signalling = openSignalling(deps.room, deps.signalOrigin);
      const info = await signalling.join(deps.room);
      ({ self, host } = info);
      const ice = info.iceServers ?? [];
      // A lost signalling server only matters while we are still in the lobby: games run on the data channels.
      signalling.onEvent?.((e) => {
        if (phase === 'lobby' && (e.kind === 'host-left' || e.kind === 'closed')) {
          lobby?.dispose();
          lobby = undefined;
          showError(
            deps.lobbyRoot,
            'Disconnected',
            e.kind === 'host-left' ? 'The host left the room.' : 'The connection to the signalling server was lost.',
          );
          phase = 'closed';
        }
      });
      const options = ice.length > 0 ? { iceServers: ice } : {};
      transport =
        deps.createTransport?.(self, host, signalling, ice) ??
        createRtcTransport({ self, host, signalling, ...options });
      transport.onPeer(onPeer);
      transport.onMessage(onMessage);
      enterLobby();
    } catch (error) {
      phase = 'closed';
      showError(deps.lobbyRoot, 'Cannot join', error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ready: connect(),
    dispose() {
      phase = 'closed';
      for (const timer of graceTimers.values()) {
        clearTimeout(timer);
      }
      graceTimers.clear();
      lobby?.dispose();
      closeGame();
      transport?.close();
      signalling?.close();
      background.dispose();
    },
  };
}
