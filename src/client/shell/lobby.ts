// Lobby view (wave 10 slice E1): lit-html over the pure state machine in lobbystate.ts.
//
//   const lobby = mountLobby(root, { room, self, host, name, fingerprint, send, broadcast });
//   lobby.onStart((start) => ...);               // `start` is the host's WireMsg 'start'
//   transport.onPeer((p, s) => (s === 'up' ? lobby.peerUp(p) : lobby.peerDown(p)));
//   transport.onMessage((from, msg) => lobby.receive(from, msg));
//   ... lobby.dispose();                          // clears root, drops listeners
//
// `host` is the signalling host (RoomInfo.host); the lobby is the host's when `self === host`.
// The caller owns the Transport and wires peer and message events into the handle.

import { html, nothing, render, type TemplateResult } from 'lit-html';
import type { Mode } from '../../match/run.ts';
import type { PeerId, WireMsg } from '../../net/types.ts';
import { createLobby, HERO_SLOTS, type Lobby, type LobbyDeps, type LobbyView } from './lobbystate.ts';
import './lobby.css';

export interface LobbyMountDeps extends LobbyDeps {
  /** The room code shown and shared. */
  readonly room: string;
  /** The invite link for `room`; defaults to this page's URL with `#room=<room>`. */
  readonly linkFor?: (room: string) => string;
  /** Copies text; defaults to the async clipboard. Resolves false on failure. */
  readonly copy?: (text: string) => Promise<boolean>;
}

export interface LobbyHandle {
  readonly lobby: Lobby;
  /** Fires once with the host's `start` message. Returns an unsubscribe. */
  onStart: (cb: (start: Extract<WireMsg, { t: 'start' }>) => void) => () => void;
  peerUp: (peer: PeerId) => void;
  peerDown: (peer: PeerId) => void;
  receive: (from: PeerId, msg: WireMsg) => void;
  dispose: () => void;
}

const HERO_NAMES = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];
const MODE_LABELS: Readonly<Record<Mode, string>> = { director: 'Director', schedule: 'Schedule' };

const COPY_LABELS = { idle: 'Copy link', yes: 'Copied', no: 'Copy failed' } as const;

function defaultLink(room: string): string {
  const url = new URL(location.href);
  url.hash = `room=${room}`;
  url.search = '';
  return url.toString();
}

async function defaultCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function holder(v: LobbyView, peer: PeerId | null): string {
  if (peer === null) {
    return 'Bot (free slot)';
  }
  if (peer === v.self) {
    return `${v.names.get(peer) ?? 'You'} (you)`;
  }
  return v.names.get(peer) ?? `Player ${peer.slice(0, 4)}`;
}

export function mountLobby(root: HTMLElement, deps: LobbyMountDeps): LobbyHandle {
  const lobby = createLobby(deps);
  const link = (deps.linkFor ?? defaultLink)(deps.room);
  const copy = deps.copy ?? defaultCopy;
  let copied: 'idle' | 'yes' | 'no' = 'idle';
  let disposed = false;

  const slotView = (v: LobbyView, i: number): TemplateResult => {
    const peer = v.slots[i] ?? null;
    const mine = peer === v.self;
    const taken = peer !== null && !mine;
    return html`<li class="lslot ${mine ? 'mine' : ''} ${taken ? 'taken' : ''}" data-slot=${i}>
      <span class="lhero">${HERO_NAMES[i]}</span>
      <span class="lwho">${holder(v, peer)}</span>
      ${
        mine
          ? html`<button type="button" data-act="release" @click=${() => lobby.release()}>Leave slot</button>`
          : html`<button type="button" data-act="pick" ?disabled=${taken} @click=${() => lobby.pick(i)}>
              ${v.mySlot === undefined ? 'Take' : 'Switch'}
            </button>`
      }
    </li>`;
  };

  const settings = (v: LobbyView): TemplateResult =>
    v.isHost
      ? html`<div class="lsettings">
          <label
            >Mode
            <select
              data-field="mode"
              .value=${v.mode}
              @change=${(e: Event) => lobby.setMode((e.target as HTMLSelectElement).value as Mode)}
            >
              ${(Object.keys(MODE_LABELS) as Mode[]).map(
                (m) => html`<option value=${m} ?selected=${m === v.mode}>${MODE_LABELS[m]}</option>`,
              )}
            </select>
          </label>
          <label
            >Seed
            <input
              data-field="seed"
              type="number"
              min="0"
              max="4294967295"
              .value=${String(v.seed)}
              @change=${(e: Event) => lobby.setSeed(Number((e.target as HTMLInputElement).value))}
            />
          </label>
        </div>`
      : html`<p class="lsettings">Mode: ${MODE_LABELS[v.mode]}. Seed: ${v.seed}. The host chooses these.</p>`;

  const errorView = (v: LobbyView): TemplateResult => html`<section class="lobby lerror" role="alert">
    <h1>${v.error?.kind === 'mismatch' ? 'Version mismatch' : 'Disconnected'}</h1>
    <p>${v.error?.message}</p>
    <p><a href="index.html">Back to the menu</a></p>
  </section>`;

  const view = (v: LobbyView): TemplateResult => {
    if (v.phase === 'error') {
      return errorView(v);
    }
    const label = COPY_LABELS[copied];
    return html`<section class="lobby">
      <h1>Lobby</h1>
      <div class="lroom">
        <span>Room <b class="lcode">${deps.room}</b></span>
        <button
          type="button"
          data-act="copy"
          @click=${async () => {
            copied = (await copy(link)) ? 'yes' : 'no';
            draw();
          }}
        >
          ${label}
        </button>
      </div>
      <p class="lname">You are <b>${deps.name}</b>${v.isHost ? ' (host)' : ''}</p>
      <ul class="lslots">
        ${Array.from({ length: HERO_SLOTS }, (_, i) => slotView(v, i))}
        <li class="lslot locked" data-slot="wave-master" aria-disabled="true">
          <span class="lhero">Wave master</span>
          <span class="lwho">Coming soon</span>
          <button type="button" disabled>Take</button>
        </li>
      </ul>
      <p class="lhint">Free slots are played by bots. One hero per player.</p>
      ${settings(v)}
      ${v.rejected > 0 ? html`<p class="lwarn">${v.rejected} player(s) with a different build were refused.</p>` : nothing}
      ${
        v.isHost
          ? html`<button type="button" class="lstart" data-act="start" ?disabled=${!v.canStart} @click=${() => lobby.start()}>
              Start
            </button>`
          : html`<p class="lwait">Waiting for the host to start.</p>`
      }
    </section>`;
  };

  function draw(): void {
    if (!disposed) {
      render(view(lobby.view()), root);
    }
  }

  const off = lobby.onChange(draw);
  draw();

  return {
    lobby,
    onStart: (cb) => lobby.onStart(cb),
    peerUp: (p) => lobby.peerUp(p),
    peerDown: (p) => lobby.peerDown(p),
    receive: (from, msg) => lobby.receive(from, msg),
    dispose() {
      if (!disposed) {
        disposed = true;
        off();
        render(nothing, root);
      }
    },
  };
}
