// Contracts of the client shell (wave 7 DESIGN "Module boundaries"). This file is the only thing the
// step-2 slices share besides each other's exported signatures: change it only through the lead.
// Pure types and constants; no DOM, no sim state beyond type imports. The data flow is
//
//   Match --step--> takeSnapshot --> interpolate --> buildScene --> InstanceBuffer --> Renderer.draw
//   Match.perception + Presentation + ControlState --> buildHudModel --> Hud.render
//   DOM events --> UiAction --> reduce --> {ControlState, Command[]} --> CommandSink.submit
//
// Units: world coordinates are sim units (the map is `MapDef.width` x `MapDef.height`, x east, y
// down in the debug viewer's convention); screen coordinates are CSS pixels with the origin at the
// top-left of the canvas. Angles are radians. Ticks are sim ticks (30 Hz).

import type { GameConfig } from '../../content/index.ts';
import type { Presentation, Targeting } from '../../content/presentation.ts';
import type { MapDef } from '../../content/types.ts';
import type { Match } from '../../match/match.ts';
import type { Mode } from '../../match/run.ts';
import type { Perception } from '../../perception/types.ts';
import type { Command } from '../../sim/commands.ts';
import type { EntityKind, Team } from '../../sim/entities.ts';

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

/** A size in CSS pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** CSS pixels the HUD covers on each side of the viewport (and the safe-area insets). */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** World or screen position (same shape as the content `Point`). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * The view of the map: fits the whole map into the viewport minus HUD insets, rotated by 90
 * degrees when the free area is portrait. Immutable. Built by `fitCamera` (camera.ts).
 */
export interface Camera {
  readonly viewport: Size;
  /** True when the map is drawn rotated 90 degrees clockwise (lane west->east reads top->bottom). */
  readonly rotated: boolean;
  /** CSS pixels per world unit. */
  readonly pxPerUnit: number;
  /** World -> clip space, 3x3 column-major (`uniformMatrix3fv`). Clip y is up. */
  readonly matrix: Float32Array;
  /** World -> CSS pixels. */
  readonly worldToScreen: (p: Vec2) => Vec2;
  /** CSS pixels -> world. The exact inverse of `worldToScreen`. */
  readonly screenToWorld: (p: Vec2) => Vec2;
  /** True when the CSS-pixel point is in the free rectangle (viewport minus HUD insets) and inside the map. */
  readonly isMapPoint: (p: Vec2) => boolean;
}

// ---------------------------------------------------------------------------------------------
// Renderer contract (gl/) and instance layout
// ---------------------------------------------------------------------------------------------

/** Straight (non-premultiplied) RGBA, each 0..1. */
export type Rgba = readonly [number, number, number, number];

/**
 * Shape ids the SDF program understands. New shapes append ids; never renumber (they are written
 * into instance buffers). Parameter use per shape (`p0`, `p1`):
 * - circle: unused
 * - ring: p0 = thickness (world units)
 * - box: p0 = corner radius (world units)
 * - segment: capsule from (-hw, 0) to (+hw, 0) in local space, p0 = half width; `hh` is ignored
 * - sector: circle of radius `hw`, kept to |angle| <= p0 (half angle, radians) around local +x
 * - arc: ring of outer radius `hw`, p0 = filled fraction 0..1 (clockwise from local +x), p1 = thickness
 * - triangle: isoceles, apex at local +x, base at -x
 */
export const SHAPE = {
  circle: 0,
  ring: 1,
  box: 2,
  segment: 3,
  sector: 4,
  arc: 5,
  triangle: 6,
} as const;

export type ShapeId = (typeof SHAPE)[keyof typeof SHAPE];

/** Floats per instance in a packed buffer: x, y, hw, hh, rot, shape, r, g, b, a, p0, p1. */
export const INSTANCE_FLOATS = 12;

/** One drawn primitive, in world space. `hw` and `hh` are half extents (a circle uses `hw` as its radius). */
export interface Instance {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  /** Rotation about (x, y) in radians. */
  readonly rot: number;
  readonly shape: ShapeId;
  readonly color: Rgba;
  readonly p0: number;
  readonly p1: number;
}

/**
 * A growable packed float buffer of instances (instances.ts). Painter's order is push order. Every
 * float written must be finite (invariant tested by the scene and instances tests).
 */
export interface InstanceBuffer {
  /** Instances pushed since the last `clear`. */
  readonly count: number;
  push: (i: Instance) => void;
  clear: () => void;
  /** The packed floats, length `count * INSTANCE_FLOATS`. A view: valid until the next `push` or `clear`. */
  data: () => Float32Array;
}

/** The WebGL2 renderer (gl/renderer.ts). One program, one instanced draw call. */
export interface Renderer {
  /** True while the context is lost; `draw` is then a no-op. */
  readonly lost: boolean;
  /** Sets the canvas CSS size and its backing store size (`round(css * dpr)`), and the GL viewport. */
  resize: (cssWidth: number, cssHeight: number, dpr: number) => void;
  /** Clears to `background` and draws every instance of `buffer` through `camera.matrix`. */
  draw: (buffer: InstanceBuffer, camera: Camera, background: Rgba) => void;
  /** Called with true on `webglcontextlost` and false after the context is restored and rebuilt. */
  onLoss: (listener: (lost: boolean) => void) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------------------------
// Snapshots, interpolation and effects (shell/snapshot.ts, interp.ts)
// ---------------------------------------------------------------------------------------------

/** One entity as the renderer sees it; also the interpolated result. */
export interface EntitySnap {
  readonly id: number;
  readonly kind: EntityKind;
  /** Content def id (`gunner`, `grunt`, `ancient`). */
  readonly def: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** 0..1. */
  readonly hpFrac: number;
  /**
   * Radians. The movement direction since the previous snapshot, else the direction to the attack
   * target, else the previous facing (0 for a new entity).
   */
  readonly facing: number;
  /** Ids of the statuses active at this tick, ascending. */
  readonly statuses: readonly string[];
}

/** The drawable state after one `match.step()`. */
export interface Snapshot {
  readonly tick: number;
  /** Ascending by id. */
  readonly entities: readonly EntitySnap[];
}

/** A short render-time effect (never fed back into the sim). Times are the app's `nowMs` clock. */
export interface Effect {
  /** `hit`: tint the target; `cast`: pulse a ring on the caster; `death`: fade a ghost ring. */
  readonly kind: 'hit' | 'cast' | 'death';
  /** Entity the effect belongs to. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly startMs: number;
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------------------------
// Frame driver (shell/frame.ts)
// ---------------------------------------------------------------------------------------------

/** Frame-driver state carried between frames. */
export interface FrameClock {
  /** `now` of the previous plan, undefined before the first. */
  readonly lastMs: number | undefined;
  /** Unconsumed simulated milliseconds, in [0, tickMs) after a plan. */
  readonly accMs: number;
}

export interface FrameOptions {
  /** Milliseconds per sim tick at speed 1 (1000 / 30). */
  readonly tickMs: number;
  /** 1 = real time. */
  readonly speed: number;
  readonly paused: boolean;
  /** A gap longer than this is clamped to it (tab switch, breakpoint). */
  readonly maxGapMs: number;
  /** Cap on sim steps per frame. */
  readonly maxSteps: number;
}

export interface FramePlan {
  /** Sim steps to run this frame, 0..maxSteps. */
  readonly steps: number;
  /** Render interpolation between the last two snapshots, in [0, 1). */
  readonly alpha: number;
  readonly clock: FrameClock;
}

// ---------------------------------------------------------------------------------------------
// Commands out: the sink and its delay
// ---------------------------------------------------------------------------------------------

/**
 * Where a human's commands go. `player` is the hero slot (D-ZWZVLE5U4MRETLI7). Wave 10 replaces the
 * local sink with the lockstep transport; nothing upstream changes.
 */
export interface CommandSink {
  submit: (player: number, cmd: Command) => void;
}

/** Ticks a local command waits before it applies (100 ms at 30 Hz), the delay lockstep will add. */
export const INPUT_DELAY_TICKS = 3;

// ---------------------------------------------------------------------------------------------
// Input: actions in, controls state, commands out (shell/controls.ts, arming.ts, input.ts)
// ---------------------------------------------------------------------------------------------

/**
 * Normalised input. Desktop, touch and HUD buttons all produce these; positions are WORLD
 * coordinates (input.ts converts with `Camera.screenToWorld`). Slots are hero slots 0-3 for
 * `select` and ability slots 0-3 for the rest, applied to the selected hero.
 */
export type UiAction =
  /** Select a hero slot (key 1-4, card, tap on a hero). Never emits a command. */
  | { readonly kind: 'select'; readonly slot: number }
  /** Pointer moved over the map (cursor for aim previews). */
  | { readonly kind: 'hover'; readonly x: number; readonly y: number }
  /**
   * Primary click or tap on the map. `unit` is the entity id picked within the pick slop, if any.
   * Confirms an aim, a fire time or a reserve; with nothing pending on a driven hero it is a move.
   */
  | { readonly kind: 'primary'; readonly x: number; readonly y: number; readonly unit?: number }
  /** Right click on the map: move (or cancel an aim). */
  | { readonly kind: 'secondary'; readonly x: number; readonly y: number }
  /**
   * An ability button or key was pressed. Instant abilities cast; others start aiming; with the arm
   * toggle on, or `arm` true (Alt+key), an armable ability starts arming instead; pressing the
   * aimed slot again cancels.
   */
  | { readonly kind: 'cast'; readonly slot: number; readonly arm?: boolean }
  /** Drag from a button and release on the map (or quick-cast): aim and confirm in one go. */
  | { readonly kind: 'castAt'; readonly slot: number; readonly x: number; readonly y: number; readonly unit?: number }
  /** Toggle autocast of the slot (Ctrl+key, long press). */
  | { readonly kind: 'autocast'; readonly slot: number }
  | { readonly kind: 'stop' }
  /** Toggle hold fire. */
  | { readonly kind: 'hold' }
  /** Toggle the arm mode (Alt, the arm button). */
  | { readonly kind: 'armToggle' }
  /** Change the fire time being picked by this many half seconds (wheel, +/- chips). */
  | { readonly kind: 'fireTime'; readonly halfSeconds: number }
  /** Confirm the picked fire time and post the intent (the picker's confirm chip, Enter). */
  | { readonly kind: 'armConfirm' }
  /** Select an intent (marker tap, list row) to reserve against or cancel. */
  | { readonly kind: 'pickIntent'; readonly id: number }
  /** Change the reserve offset by this many half seconds. */
  | { readonly kind: 'reserveOffset'; readonly halfSeconds: number }
  /** Cancel the driven hero's own intent or reservation. */
  | { readonly kind: 'cancelIntent'; readonly id: number }
  /** Back out of whatever is pending (Esc, cancel chip, tapping the aimed button again). */
  | { readonly kind: 'cancel' }
  /** Local pause toggle (no command). */
  | { readonly kind: 'pause' }
  /** Toggle the help overlay (H, the top bar "?"). Never emits a command and never pauses. */
  | { readonly kind: 'help' }
  /** Restart the match (handled by the app, ignored by the reducer). */
  | { readonly kind: 'restart' };

/** An ability being aimed. */
interface AimState {
  readonly slot: number;
  readonly targeting: Targeting;
}

/**
 * Arming sub-state (arming.ts). `off`: not arming. `aim`: choosing the cast point of an armable
 * ability. `time`: choosing the fire time (the point is set). `reserve`: an intent is selected
 * and the next `cast` of an ability reserves it.
 */
export interface ArmingState {
  /** The arm toggle: the next armable `cast` starts arming. */
  readonly armOn: boolean;
  readonly phase: 'off' | 'aim' | 'time' | 'reserve';
  /** Ability slot being armed; -1 when none. */
  readonly slot: number;
  /** Cast point, valid in `time` (and `aim` once hovered). */
  readonly x: number;
  readonly y: number;
  /** Fire time in half seconds; default 4 (2 s), range 2..10 (1-5 s). */
  readonly fireHalfSeconds: number;
  /** Intent id selected for reserve or cancel; 0 when none. */
  readonly intent: number;
  /** Reserve offset in half seconds, default 0. */
  readonly offsetHalfSeconds: number;
  /** The last `post` submitted: its hero and the last tick before the board has seen it. */
  readonly lastPost: { readonly hero: number; readonly untilTick: number } | undefined;
}

/** A short HUD message ("a second trigger is already armed"). UX only, not a rule. */
interface Hint {
  readonly text: string;
  /** First tick at which it is no longer shown. */
  readonly untilTick: number;
}

/** Everything the reducer remembers. Plain data, replaced not mutated. */
export interface ControlState {
  /** Selected hero slot 0-3. */
  readonly selected: number;
  readonly aim: AimState | undefined;
  /** Last hover position in world coordinates. */
  readonly cursor: Vec2 | undefined;
  readonly arming: ArmingState;
  readonly paused: boolean;
  /** The help overlay is open. */
  readonly help: boolean;
  readonly hint: Hint | undefined;
}

/** What the reducer reads besides state and action. */
export interface ControlContext {
  readonly p: Perception;
  /** Hero slots a human drives (commands are only emitted for these, and only while alive). */
  readonly driven: readonly number[];
  readonly ui: Presentation;
  /** `game.intents.maxOffsetSeconds`: the longest reserve offset the board accepts. */
  readonly maxOffsetSeconds: number;
}

export interface ReduceResult {
  readonly state: ControlState;
  /** In order. Hero ids come from `p.heroes[slot].id`; the caller submits them as player = driven slot. */
  readonly commands: readonly Command[];
}

/** What the arming sub-reducer returns to `reduce`. `handled` false: `reduce` processes the action itself. */
export interface ArmStep {
  readonly arming: ArmingState;
  readonly commands: readonly Command[];
  readonly handled: boolean;
  /** A refusal explanation to show, if any. */
  readonly hint?: string;
  /** True when arming consumed the pending aim (the controls aim should clear). */
  readonly clearAim?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Scene (shell/scene.ts, intentfx.ts, palette.ts)
// ---------------------------------------------------------------------------------------------

/** Everything the scene needs to emit one frame of instances. */
export interface SceneInput {
  readonly map: MapDef;
  /** Interpolated entities, ascending by id. */
  readonly entities: readonly EntitySnap[];
  /** Latest perception (statuses, intents, ranges); one tick older than `entities` is fine. */
  readonly p: Perception;
  readonly controls: ControlState;
  readonly camera: Camera;
  readonly ui: Presentation;
  readonly driven: readonly number[];
  readonly effects: readonly Effect[];
  /** The app's clock in milliseconds (the only wall time the scene sees). */
  readonly nowMs: number;
  /** Fractional sim tick (`p.tick + alpha`) for smooth countdown rings. */
  readonly tickF: number;
}

/** What `intentfx` needs: the intent markers, the arm preview and the countdown rings. */
export interface IntentFxInput {
  readonly p: Perception;
  readonly arming: ArmingState;
  readonly selected: number;
  readonly driven: readonly number[];
  readonly ui: Presentation;
  /** Fractional tick for smooth rings (tick + alpha). */
  readonly tickF: number;
  readonly pxPerUnit: number;
  /** Last hover position in world coordinates (the aim preview follows it). */
  readonly cursor: Vec2 | undefined;
}

// ---------------------------------------------------------------------------------------------
// HUD model (shell/hudmodel.ts, hud.ts, intentsui.ts)
// ---------------------------------------------------------------------------------------------

export interface PreviewChip {
  readonly def: string;
  readonly label: string;
  readonly color: string;
  readonly count: number;
}

export interface TopBarModel {
  /** Waves started. */
  readonly wave: number;
  readonly total: number;
  /** Seconds to the next wave clock, 0 when none is pending. */
  readonly nextInSeconds: number;
  /** Empty in Director mode; `previewHidden` then says why. */
  readonly preview: readonly PreviewChip[];
  readonly previewHidden: boolean;
  readonly ancientFrac: number;
  readonly paused: boolean;
  /** The help overlay is open (the "?" button shows pressed). */
  readonly help: boolean;
}

export interface ResourceBarModel {
  readonly name: string;
  readonly label: string;
  readonly color: string;
  /** 0..1. */
  readonly frac: number;
  /** 0..1 thresholds, ascending. */
  readonly marks: readonly number[];
}

export interface StatusPipModel {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  /** SVG path `d` (24x24); undefined means show the glyph. */
  readonly icon: string | undefined;
  readonly color: string;
  readonly harmful: boolean;
  /** Seconds left, from `StatusView.until`. */
  readonly secondsLeft: number;
  /** Ring fill 0..1 for the HUD: `secondsLeft` over the longest remaining seen for this status id. */
  readonly frac: number;
}

export interface HeroCardModel {
  readonly slot: number;
  readonly def: string;
  readonly label: string;
  readonly color: string;
  /** 0..1. */
  readonly hpFrac: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly resources: readonly ResourceBarModel[];
  readonly statuses: readonly StatusPipModel[];
  /** A human drives it ('you') or a bot ('bot'). */
  readonly badge: 'you' | 'bot';
  readonly selected: boolean;
  /** No hero in perception for this slot (dead). */
  readonly dead: boolean;
}

export interface AbilityButtonModel {
  readonly slot: number;
  readonly effect: string;
  readonly label: string;
  readonly glyph: string;
  /** SVG path `d` (24x24); undefined means show the glyph. */
  readonly icon: string | undefined;
  /** Key label such as 'Q'. */
  readonly hotkey: string;
  readonly targeting: Targeting;
  readonly ready: boolean;
  /** Remaining cooldown 0..1 (0 = ready); the conic sweep. */
  readonly cooldownFrac: number;
  readonly autocast: boolean;
  readonly armable: boolean;
  /** The selected hero is human-driven and alive. */
  readonly enabled: boolean;
  /** Currently being aimed or armed. */
  readonly active: boolean;
}

export interface AbilityBarModel {
  /** Selected hero slot. */
  readonly slot: number;
  readonly buttons: readonly AbilityButtonModel[];
  readonly hold: boolean;
  readonly armOn: boolean;
  readonly enabled: boolean;
}

/** One ability card of the help overlay. */
export interface HelpAbilityModel {
  readonly slot: number;
  readonly label: string;
  readonly glyph: string;
  readonly icon: string | undefined;
  readonly hotkey: string;
  /** How it is aimed, as text. */
  readonly targeting: string;
  /** Full cooldown in seconds from perception; 0 when it has none (a toggle, or no cooldown). */
  readonly cooldownSeconds: number;
  /** Cost or side effect, empty when free. */
  readonly cost: string;
  /** Filled description, empty when help has no entry for the effect. */
  readonly text: string;
  /** Can be posted as a timed trigger. */
  readonly armable: boolean;
}

/** One row of the help overlay's status legend. */
export interface HelpStatusModel {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  readonly icon: string | undefined;
  readonly color: string;
  readonly harmful: boolean;
  readonly text: string;
}

/** The help overlay: the selected hero's ability cards and the status legend. */
export interface HelpModel {
  /** The selected hero's label; empty when it is dead. */
  readonly hero: string;
  readonly abilities: readonly HelpAbilityModel[];
  readonly statuses: readonly HelpStatusModel[];
}

export interface IntentRowModel {
  readonly id: number;
  readonly label: string;
  readonly glyph: string;
  /** Seconds to the fire tick, 0 once fired. */
  readonly secondsLeft: number;
  readonly fired: boolean;
  /** Posted by a hero a human drives. */
  readonly mine: boolean;
  /** The selected hero already reserves it. */
  readonly reserved: boolean;
  /** Reserver swatches (hex), ascending hero id. */
  readonly reservers: readonly string[];
  readonly canReserve: boolean;
  readonly canCancel: boolean;
  readonly selected: boolean;
}

/** The fire-time picker shown while arming (`phase` 'time') and the reserve offset while reserving. */
export interface ArmPickerModel {
  readonly mode: 'fire' | 'reserve';
  readonly seconds: number;
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

interface EndModel {
  readonly result: 'win' | 'loss' | 'time';
  readonly wave: number;
}

export interface HudModel {
  readonly top: TopBarModel;
  /** One per slot 0-3. */
  readonly heroes: readonly HeroCardModel[];
  /** For the selected hero; undefined when it is dead. */
  readonly bar: AbilityBarModel | undefined;
  readonly intents: readonly IntentRowModel[];
  readonly picker: ArmPickerModel | undefined;
  /** An active hint text, if any. */
  readonly hint: string | undefined;
  /** Undefined while help is closed. */
  readonly help: HelpModel | undefined;
  readonly end: EndModel | undefined;
}

/** Everything `buildHudModel` reads. */
export interface HudInput {
  readonly p: Perception;
  readonly ui: Presentation;
  readonly controls: ControlState;
  readonly driven: readonly number[];
  /** `game.intents.maxOffsetSeconds`; bounds the reserve offset picker. */
  readonly maxOffsetSeconds: number;
  /** The game config, the source of help numbers (hero and status defs); without it help shows `?` for them. */
  readonly game?: GameConfig;
  /** Set once the match has ended. */
  readonly end: { readonly reason: 'ancient-destroyed' | 'victory' | 'maxTicks'; readonly wave: number } | undefined;
}

/** What the HUD needs from the shell. */
export interface HudDeps {
  readonly dispatch: (action: UiAction) => void;
  /** For a drag from an ability button onto the map (`castAt`): the world point under a client-pixel point, or undefined when it is not map (HUD, outside the map). */
  readonly mapPoint: (p: Vec2) => Vec2 | undefined;
}

/** The mounted HUD (hud.ts). Buttons dispatch `UiAction`s. */
export interface Hud {
  /** Renders `model` (idempotent; the app calls it at most once per sim tick). */
  render: (model: HudModel) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------------------------
// Shell configuration and mounting (shell/config.ts, app.ts, main.ts)
// ---------------------------------------------------------------------------------------------

/** `play.html#seed=1&mode=director&drive=0` parsed. Invalid fields fall back to the defaults. */
export interface ShellConfig {
  readonly seed: number;
  readonly mode: Mode;
  /** Hero slots a human drives, unique, ascending. Empty = watch (all bots). Default [0]. */
  readonly drive: readonly number[];
}

/** The page elements the shell mounts onto (play.html provides them). */
export interface ShellElements {
  readonly canvas: HTMLCanvasElement;
  /** The HUD root, an overlay positioned over the canvas. */
  readonly hud: HTMLElement;
}

/** Injection points so tests control time, the sink and the frame loop. All optional. */
export interface ShellOptions {
  /** Replaces `localSink(match, INPUT_DELAY_TICKS)`; called with the new match on start and on every restart. */
  readonly sink?: (match: Match) => CommandSink;
  /** Milliseconds clock; default `performance.now`. The only wall-clock read of the shell. */
  readonly now?: () => number;
  /** Frame scheduler; default `requestAnimationFrame`. Returns a cancel function. */
  readonly schedule?: (frame: (nowMs: number) => void) => () => void;
}

export interface ShellHandle {
  /** The live match (a restart replaces it; read `match()` each time). */
  readonly match: () => Match;
  readonly controls: () => ControlState;
  /** Feeds an action as if the user had input it (tests and automation). */
  readonly dispatch: (action: UiAction) => void;
  /** False when WebGL2 is unavailable (the shell shows its fallback message and runs no loop). */
  readonly rendering: boolean;
  dispose: () => void;
}
