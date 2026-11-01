// The lit-html HUD over the canvas, rendered from a HudModel. Owner: w7-hud.
// Styles live in hud.css (imported here); the layout must not overlap the free map area that
// `hudInsets` (hudmodel.ts) leaves, at 390x844 and 1280x720.

import type { TemplateResult } from 'lit-html';
import { html, render as litRender, nothing } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import { KEY_HELP, KEY_HOLD, KEY_STOP } from './input.ts';
import { armPickerView, intentsListView } from './intentsui.ts';
import type {
  AbilityBarModel,
  AbilityButtonModel,
  HelpAbilityModel,
  HelpModel,
  HelpStatusModel,
  HeroCardModel,
  Hud,
  HudDeps,
  HudModel,
  ResourceBarModel,
  StatusPipModel,
  TopBarModel,
  UiAction,
} from './types.ts';
import './hud.css';

/** Hold time that turns a press on an ability button into an autocast toggle. */
const LONG_PRESS_MS = 500;
/** Pointer travel (CSS px) after which a press becomes a drag. */
const DRAG_SLOP_PX = 10;
/** Re-render cap: the HUD redraws at most 30 times a second. */
const MIN_RENDER_GAP_MS = 1000 / 30 - 2;

const END_TITLE = { win: 'Victory', loss: 'Defeat', time: 'Time' } as const;

type Dispatch = (action: UiAction) => void;

/** An icon from path data (24x24, even-odd); the glyph text when the id has no icon. */
function iconView(icon: string | undefined, glyph: string): TemplateResult {
  if (icon === undefined) {
    return html`<span class="glyph">${glyph}</span>`;
  }
  return html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d=${icon}></path></svg>`;
}

/** Seconds for prose: whole numbers as is, otherwise one decimal (so "0.4s", never "0s"). */
function seconds(s: number): string {
  return `${Number.isInteger(s) && s >= 1 ? String(s) : s.toFixed(1)}s`;
}

const pct = (f: number): string => `${(f * 100).toFixed(1)}%`;

function topBarView(t: TopBarModel, dispatch: Dispatch): TemplateResult {
  // In wave master mode Perception gives no composition (nobody sees the queue): show no chips.
  const preview = t.preview.map(
    (c) =>
      html`<span class="chip" title=${c.label} style=${styleMap({ '--c': c.color })}>${c.label.slice(0, 2)}&times;${c.count}</span>`,
  );
  const next = t.nextInSeconds > 0 ? html`<span class="next">${Math.ceil(t.nextInSeconds)}s</span>` : nothing;
  return html`<div class="top">
    <span class="wave">Wave ${t.wave}/${t.total}</span>
    ${next}
    <span class="preview">${preview}</span>
    <span class="ancient" role="progressbar" aria-label="Ancient hp" aria-valuenow=${Math.round(t.ancientFrac * 100)}>
      <i style=${styleMap({ width: pct(t.ancientFrac) })}></i>
    </span>
    <button
      class="btn helpbtn ${t.help ? 'on' : ''}"
      type="button"
      aria-label="Help"
      aria-pressed=${t.help ? 'true' : 'false'}
      @click=${() => dispatch({ kind: 'help' })}
    >
      ?
    </button>
    <button class="btn pause" type="button" aria-label=${t.paused ? 'Resume' : 'Pause'} @click=${() => dispatch({ kind: 'pause' })}>
      ${t.paused ? '▶' : '⏸'}
    </button>
    <a class="btn viewer" href="./index.html" aria-label="Debug viewer">&#9881;</a>
  </div>`;
}

function resourceView(r: ResourceBarModel): TemplateResult {
  return html`<div class="res" title=${r.label} style=${styleMap({ '--c': r.color })}>
    <i style=${styleMap({ width: pct(r.frac) })}></i>
    ${r.marks.map((m) => html`<b class="mark" style=${styleMap({ left: pct(m) })}></b>`)}
  </div>`;
}

function pipView(s: StatusPipModel): TemplateResult {
  return html`<span
    class="pip ${s.harmful ? 'harmful' : 'boon'}"
    role="img"
    aria-label=${s.label}
    title="${s.label} ${s.secondsLeft.toFixed(1)}s"
    style=${styleMap({ '--c': s.color, '--ring': `${(s.frac * 360).toFixed(0)}deg` })}
    >${iconView(s.icon, s.glyph)}</span
  >`;
}

function cardView(c: HeroCardModel, dispatch: Dispatch): TemplateResult {
  const cls = `card${c.selected ? ' selected' : ''}${c.dead ? ' dead' : ''}`;
  return html`<button
    class=${cls}
    type="button"
    aria-label="Select ${c.label}"
    aria-pressed=${c.selected ? 'true' : 'false'}
    style=${styleMap({ '--c': c.color })}
    @click=${() => dispatch({ kind: 'select', slot: c.slot })}
  >
    <span class="name"><i class="swatch"></i>${c.label}<small class="badge ${c.badge}">${c.badge}</small></span>
    <span class="hp" role="progressbar" aria-label="${c.label} hp" aria-valuenow=${Math.round(c.hpFrac * 100)}>
      <i style=${styleMap({ width: pct(c.hpFrac) })}></i>
    </span>
    ${c.resources.map(resourceView)}
    <span class="pips">${c.statuses.map(pipView)}</span>
  </button>`;
}

/** Per-render-scope gesture state of ability buttons (one pointer at a time). */
interface Gesture {
  slot: number;
  x: number;
  y: number;
  dragging: boolean;
  long: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

function createGestures(deps: HudDeps): {
  down: (slot: number, e: PointerEvent) => void;
  move: (e: PointerEvent) => void;
  up: (e: PointerEvent) => void;
  cancel: () => void;
  click: (slot: number, e: MouseEvent) => void;
} {
  let g: Gesture | undefined;
  let swallowClick = false;
  const clear = (): void => {
    if (g?.timer !== undefined) {
      clearTimeout(g.timer);
    }
    g = undefined;
  };
  return {
    down(slot, e) {
      clear();
      swallowClick = false;
      const gesture: Gesture = { slot, x: e.clientX, y: e.clientY, dragging: false, long: false, timer: undefined };
      gesture.timer = setTimeout(() => {
        gesture.long = true;
        gesture.timer = undefined;
        deps.dispatch({ kind: 'autocast', slot });
      }, LONG_PRESS_MS);
      g = gesture;
    },
    move(e) {
      if (g === undefined || g.dragging) {
        return;
      }
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_SLOP_PX) {
        g.dragging = true;
        if (g.timer !== undefined) {
          clearTimeout(g.timer);
          g.timer = undefined;
        }
      }
    },
    up(e) {
      if (g === undefined) {
        return;
      }
      const { slot, dragging, long } = g;
      clear();
      if (long) {
        swallowClick = true;
      } else if (dragging) {
        swallowClick = true;
        const w = deps.mapPoint({ x: e.clientX, y: e.clientY });
        if (w !== undefined) {
          deps.dispatch({ kind: 'castAt', slot, x: w.x, y: w.y });
        }
      }
    },
    cancel() {
      clear();
    },
    click(slot, e) {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      deps.dispatch(e.altKey ? { kind: 'cast', slot, arm: true } : { kind: 'cast', slot });
    },
  };
}

type Gestures = ReturnType<typeof createGestures>;

function abilityView(b: AbilityButtonModel, gestures: Gestures): TemplateResult {
  const cls = ['ability', b.ready ? 'ready' : '', b.active ? 'active' : '', b.autocast ? 'auto' : '']
    .filter((x) => x !== '')
    .join(' ');
  return html`<button
    class=${cls}
    type="button"
    ?disabled=${!b.enabled}
    data-slot=${b.slot}
    data-targeting=${b.targeting}
    aria-label="${b.label} (${b.hotkey})"
    aria-pressed=${b.active ? 'true' : 'false'}
    style=${styleMap({ '--cd': `${(b.cooldownFrac * 360).toFixed(0)}deg` })}
    @pointerdown=${(e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      gestures.down(b.slot, e);
    }}
    @pointermove=${(e: PointerEvent) => gestures.move(e)}
    @pointerup=${(e: PointerEvent) => gestures.up(e)}
    @pointercancel=${() => gestures.cancel()}
    @contextmenu=${(e: Event) => e.preventDefault()}
    @click=${(e: MouseEvent) => gestures.click(b.slot, e)}
  >
    ${iconView(b.icon, b.glyph)}
    <small class="key">${b.hotkey}</small>
    ${b.autocast ? html`<i class="autopip"></i>` : nothing}
  </button>`;
}

function barView(bar: AbilityBarModel, gestures: Gestures, dispatch: Dispatch): TemplateResult {
  return html`<div class="abilities">
    ${bar.buttons.map((b) => abilityView(b, gestures))}
    <button class="btn" type="button" ?disabled=${!bar.enabled} aria-label="Stop (${KEY_STOP})" @click=${() => dispatch({ kind: 'stop' })}>
      Stop<small class="key">${KEY_STOP}</small>
    </button>
    <button
      class="btn ${bar.hold ? 'on' : ''}"
      type="button"
      ?disabled=${!bar.enabled}
      aria-pressed=${bar.hold ? 'true' : 'false'}
      aria-label="Hold fire (${KEY_HOLD})"
      @click=${() => dispatch({ kind: 'hold' })}
    >
      Hold<small class="key">${KEY_HOLD}</small>
    </button>
    <button
      class="btn ${bar.armOn ? 'on' : ''}"
      type="button"
      ?disabled=${!bar.enabled}
      aria-pressed=${bar.armOn ? 'true' : 'false'}
      aria-label="Arm a timed trigger"
      @click=${() => dispatch({ kind: 'armToggle' })}
    >
      Arm
    </button>
  </div>`;
}

function helpAbilityView(a: HelpAbilityModel): TemplateResult {
  const facts = [
    html`<li>${a.targeting}</li>`,
    html`<li>${a.cooldownSeconds > 0 ? `Cooldown ${seconds(a.cooldownSeconds)}` : 'No cooldown'}</li>`,
    a.cost === '' ? nothing : html`<li>Cost: ${a.cost}</li>`,
    html`<li>${a.armable ? 'Can be armed as a timed trigger' : 'Cannot be armed'}</li>`,
  ];
  return html`<article class="helpcard">
    <span class="ico">${iconView(a.icon, a.glyph)}</span>
    <div>
      <h3>${a.label} <kbd>${a.hotkey}</kbd></h3>
      <ul>${facts}</ul>
      ${a.text === '' ? nothing : html`<p>${a.text}</p>`}
    </div>
  </article>`;
}

function helpStatusView(s: HelpStatusModel): TemplateResult {
  return html`<li class="helpstatus ${s.harmful ? 'harmful' : 'boon'}" style=${styleMap({ '--c': s.color })}>
    <span class="pip">${iconView(s.icon, s.glyph)}</span>
    <div>
      <b>${s.label}</b> <small>${s.harmful ? 'harmful' : 'helpful'}</small>
      ${s.text === '' ? nothing : html`<p>${s.text}</p>`}
    </div>
  </li>`;
}

function helpView(h: HelpModel, dispatch: Dispatch): TemplateResult {
  return html`<div class="help" data-hit role="dialog" aria-label="Help" tabindex="0">
    <header>
      <h2>${h.hero === '' ? 'Help' : `${h.hero}: abilities`}</h2>
      <button class="btn closehelp" type="button" aria-label="Close help" @click=${() => dispatch({ kind: 'help' })}>&times;</button>
    </header>
    <div class="helpcards">${h.abilities.map(helpAbilityView)}</div>
    <h2>Keys</h2>
    <p class="keys">${KEY_HELP.map((k) => html`<span><kbd>${k.keys}</kbd> ${k.does}</span>`)}</p>
    <h2>Statuses</h2>
    <ul class="legend">${h.statuses.map(helpStatusView)}</ul>
  </div>`;
}

function endView(model: HudModel, dispatch: Dispatch): TemplateResult | typeof nothing {
  const { end } = model;
  if (end === undefined) {
    return nothing;
  }
  return html`<div class="end" data-hit role="dialog" aria-label="Match result">
    <h2>${END_TITLE[end.result]}</h2>
    <p>Wave ${end.wave}</p>
    <button class="btn primary" type="button" @click=${() => dispatch({ kind: 'restart' })}>Restart</button>
  </div>`;
}

function template(model: HudModel, deps: HudDeps, gestures: Gestures): TemplateResult {
  const { dispatch } = deps;
  return html`
    ${topBarView(model.top, dispatch)}
    ${model.hint === undefined ? nothing : html`<div class="hint" role="status">${model.hint}</div>`}
    ${model.intents.length > 0 ? html`<div class="intents" data-hit>${intentsListView(model.intents, dispatch)}</div>` : nothing}
    ${model.picker === undefined ? nothing : html`<div class="picker" data-hit>${armPickerView(model.picker, dispatch)}</div>`}
    ${model.bar === undefined ? nothing : barView(model.bar, gestures, dispatch)}
    <div class="cards">${model.heroes.map((c) => cardView(c, dispatch))}</div>
    ${model.help === undefined ? nothing : helpView(model.help, dispatch)}
    ${endView(model, dispatch)}
  `;
}

/**
 * Mounts the HUD into `root` (top bar, 4 hero cards, ability bar, intents list via intentsui.ts,
 * end overlay). Buttons dispatch `UiAction`s through `deps`; a long press (500 ms) on an ability
 * button dispatches `autocast`; a drag from a button released over the map dispatches `castAt`
 * with `deps.mapPoint`. Re-render only changes DOM that changed (lit-html).
 */
export function createHud(root: HTMLElement, deps: HudDeps): Hud {
  const gestures = createGestures(deps);
  root.classList.add('hud-root');
  let lastMs = Number.NEGATIVE_INFINITY;
  let pending: HudModel | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  let helpOpen = false;
  let opener: HTMLElement | null = null;
  const draw = (model: HudModel): void => {
    lastMs = performance.now();
    const open = model.help !== undefined;
    if (open && !helpOpen) {
      opener = document.activeElement as HTMLElement | null;
    }
    litRender(template(model, deps, gestures), root);
    if (open && !helpOpen) {
      root.querySelector<HTMLElement>('.closehelp')?.focus();
    } else if (!open && helpOpen) {
      // Give focus back unless the player has already moved it to something else.
      const active = document.activeElement;
      if ((active === null || active === document.body) && opener?.isConnected === true) {
        opener.focus();
      }
      opener = null;
    }
    helpOpen = open;
  };

  return {
    render(model) {
      if (disposed) {
        return;
      }
      const wait = lastMs + MIN_RENDER_GAP_MS - performance.now();
      if (wait <= 0 && timer === undefined) {
        draw(model);
        return;
      }
      pending = model;
      if (timer === undefined) {
        timer = setTimeout(
          () => {
            timer = undefined;
            if (pending !== undefined && !disposed) {
              const m = pending;
              pending = undefined;
              draw(m);
            }
          },
          Math.max(0, wait),
        );
      }
    },
    dispose() {
      disposed = true;
      gestures.cancel();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      litRender(nothing, root);
      root.classList.remove('hud-root');
    },
  };
}
