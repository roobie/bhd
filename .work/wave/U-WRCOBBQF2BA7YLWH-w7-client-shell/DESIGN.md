# Design

## Problem
M2 needs something playable on desktop and mobile. Today `src/client/` holds only the Canvas2D debug viewer: it is read-only, sends no commands and is laid out like a page, not a game. Wave 7 (project DESIGN §7: 7a renderer, 7b input→commands, 7c HUD, 7d arming triggers) builds the client shell that waves 8 (solo loop), 10 (multiplayer) and 11 (wave master UI) plug into.

What already exists and shapes the design:
- `Match` (`src/match/match.ts`) runs bots as seats for players 0–3 (hero slots) and 4 (Director). A hero whose slot has no seat is idle, so a human can drive it through `sim.command(player, cmd, tick)`.
- `Perception` (`src/perception/types.ts`) is already a kit-agnostic, player-visible view: `HeroView.abilities[]` (effect, ready, cooldownLeft, range, radius), `HeroView.resources[]` (name, frac, band), statuses, intents, wave preview, the Ancient. The HUD reads this, not kit state.
- Commands: `move`, `stop`, `hold`, `ability {slot, x?, y?, target?}`, `autocast {slot, on}`, `intent post|reserve|cancel`. There is no attack command: heroes acquire targets themselves.
- An armed trigger is an `intent post`: at `fireTick` the sim casts the poster's slot at (x, y) (`src/intents/board.ts`). Bots reserve against `intentKind: 'pull'` (the Gunner reserves Furnace Heart).
- Records: D-KSV7KSI3V23XZGVT (build the renderer fresh), D-L4YBMBS6WHJFMHK2 (lit-html for DOM UI), D-ZWZVLE5U4MRETLI7 (per-player command order; player = slot), D-536BLJJXM7X72IT7 (intent lifecycle), D-4E4QRJ7N6LIGZDSD (no gameplay pinning), L-KKABEETAPV7WAU6U (browser test naming), L-ZN7SSMFEBPMSB5WP (Biome idioms, max 4 params). Backlog B-C4FU2FN3T5OXCUTV (pure frame driver) is taken into this wave.

## Approach

### Coexistence with the debug viewer (lead decision)
The shell is a **second page**, `play.html`, with its code in `src/client/shell/` (DOM, wiring) and `src/client/gl/` (WebGL2). `index.html` and the debug viewer files stay as they are, so B's Pages link keeps working. Vite builds both pages (`build.rollupOptions.input`), and Pages serves both. The viewer gets a "play" link carrying seed and mode, and the shell links back. Nothing in `src/client/*.ts` (viewer) is imported by the shell except the pure parsers in `config.ts` (`parseSeed`, `parseMode`) and `heroColor`-style hashing if useful. Merging the two, or making the WebGL renderer the replay view, is a later call (wave 8 or after).

Shell URL hash: `play.html#seed=1&mode=director&drive=0` (drive: comma list of slots 0–3; `drive=` empty means watch, all bots). Invalid fields fall back to defaults, as in the viewer. Default: `drive=0` (the Gunner).

### Minimal "drive a hero" form (lead decision)
`GameSpec` gets an optional `humans?: readonly number[]` (slots with no bot seat; validated as unique slots 0–3). `buildMatch` leaves those seats out. The shell submits that slot's commands as player = slot through a `CommandSink`:

- `localSink(match, delayTicks)`: `submit(player, cmd)` calls `match.sim.command(player, cmd, match.tick + delayTicks)`.
- `INPUT_DELAY_TICKS = 3` (100 ms at 30 Hz), the same delay lockstep will add, so local feel matches multiplayer. Wave 10 swaps the sink for the lockstep transport and nothing upstream changes.

RUN_ABI stays 1: an absent `humans` means what it meant before, and the reporter never sets it. Replaying a driven game from its log needs the logged human `cmd` events fed back in; that is wave 8 work (backlog).

### Module boundaries
```
src/client/shell/types.ts     contracts: snapshots, Camera, instance layout, ControlState, UiAction, CommandSink, HudModel, FrameClock
src/client/shell/config.ts    hash parse/serialise for play.html
src/client/shell/main.ts      entry; app.ts wires match + frame loop + renderer + input + HUD
src/client/shell/sink.ts      localSink
src/client/shell/frame.ts     planFrame (pure frame driver)
src/client/shell/snapshot.ts  sim -> Snapshot after each step (positions, hp, facing, statuses)
src/client/shell/interp.ts    lerp(prev, curr, alpha) -> drawn entities
src/client/shell/camera.ts    fitCamera: fit + rotate for portrait, world<->screen, clip matrix
src/client/shell/palette.ts   RGBA tokens (dark, grimdark); entity/status colours with hashed fallback
src/client/shell/scene.ts     drawn entities + perception + controls -> InstanceBuffer (world space)
src/client/shell/controls.ts  pure reducer: (ControlState, UiAction, ctx) -> {state, commands}
src/client/shell/input.ts     DOM adapter: pointer + keyboard events -> UiAction (picking via Camera)
src/client/shell/hudmodel.ts  pure: Perception + presentation + controls -> HudModel
src/client/shell/hud.ts       lit-html HUD from HudModel; buttons dispatch UiAction; hud.css
src/client/shell/arming.ts    pure arm/reserve/cancel sub-reducer (called by controls.ts)
src/client/shell/intentsui.ts lit-html: arm timer picker, live intents list (reserve/cancel)
src/client/shell/intentfx.ts  scene instances for intents and the arm preview (called by scene.ts)
src/client/gl/context.ts      WebGL2 context, resize with DPR, context loss/restore
src/client/gl/shaders.ts      GLSL 300 es sources (one SDF program)
src/client/gl/renderer.ts     createRenderer(canvas) -> Renderer {resize, draw(buffer, camera), dispose}
src/client/gl/instances.ts    InstanceBuffer: growable Float32Array, pack/clear (pure)
src/content/presentation.ts   kit-agnostic UI data: abilities by effect, resources, statuses, heroes, enemies
```

### Renderer (7a)
- **One program, one draw call.** A unit quad from `gl_VertexID` (triangle strip, no vertex buffer) drawn with `drawArraysInstanced`. Each instance is 12 floats: `x, y, hw, hh, rot, shape, r, g, b, a, p0, p1` (world-space centre, half extents, rotation, shape id, straight RGBA, two shape params). The fragment shader evaluates the shape's SDF in local space and anti-aliases with `fwidth`; blending is premultiplied alpha.
- **Shapes:** circle, ring (p0 thickness), box (p0 corner radius), segment/capsule (lane, lines; p0 half width), sector (cones and arcs; p0 half angle), arc (hp and cooldown rings; p0 fill fraction, p1 thickness), triangle (facing marker). New shapes append ids, never renumber.
- **Painter's order** is buffer order. The scene emits layers in a fixed order: ground (map rect, lane segments, Ancient), decals (ranges, aim previews, intent markers), bodies, overlays (hp arcs, status pips, selection ring, facing marks).
- **Sizes have a pixel floor.** Phone portrait gives about 7–8 px per world unit, so a 0.6-radius hero would be about 5 px. The scene gets `camera.pxPerUnit` and clamps body radius to at least 6 css px, pips and markers likewise.
- **No text in GL.** Names and numbers live in the DOM HUD. Floating callouts are wave 8c.
- **Event flashes (kit-agnostic):** a `dmg` event tints the target for ~120 ms; an `ability` event pulses a ring on the caster. Render-time only. Hitstop and stings are 8c.
- **Context loss:** the renderer reports `lost`, the shell shows "graphics context lost" and rebuilds on restore. No WebGL2: the shell shows a message with a link to the debug viewer (WebGL2 is a locked decision, so there is no Canvas2D fallback).

### Interpolation and frame driver
- `planFrame(clock, now, opts) -> {steps, alpha, clock}`: pure, adopts B-C4FU2FN3T5OXCUTV. It clamps long gaps (250 ms), caps steps per frame (as the viewer does), honours pause and speed, and returns `alpha` in [0, 1). `now` and `requestAnimationFrame` are injected, and `app.ts` is the only place that reads `performance.now`. Real time never reaches the sim.
- After every `match.step()` the shell takes a `Snapshot` (id-ordered entity snaps: kind, def, team, x, y, radius, hpFrac, facing, active status ids). The renderer draws `interp(prev, curr, alpha)`: one tick (33 ms) of visual latency.
- A spawned entity (not in prev) appears at curr. A removed one (not in curr) is dropped, and a death event fades a 150 ms ghost ring. Facing is kit-agnostic: the movement direction, else the direction to `attack.target`, else the last facing.

### Camera
- `fitCamera(map, viewport, insets)` fits the whole map (100×50) into the viewport minus HUD insets. It **rotates 90° when the free area is portrait** (a 2:1 map in a 9:19 phone gets about twice the scale). The lane's west→east then reads top→bottom with the Ancient at the bottom, near the thumbs.
- It exposes `worldToScreen`, `screenToWorld` (exact inverse, for picking), the world→clip `matrix` (3×3, column-major) and `pxPerUnit`. No pan or zoom in wave 7: the map is small and reading it stays frictionless (pillar 1 exemption). Zoom can come if phone play shows the need.
- Insets come from the HUD layout: portrait reserves a bottom band (ability bar, then hero cards) and a thin top bar. Landscape reserves a left column of hero cards and a bottom-right ability cluster. `env(safe-area-inset-*)` is honoured.

### Input → commands (7b)
One normalised `UiAction` stream feeds a pure reducer, so desktop, touch and HUD buttons share one code path, and the reducer is testable in Node.

`reduce(state, action, ctx) -> {state, commands}`, where `ctx = {p: Perception, driven: slots, ui: Presentation}`. Hero ids come from `p.heroes[slot].id`; player = slot. Commands are only emitted for driven, live heroes. Selecting a bot hero shows its card, and its buttons are disabled with a "bot" badge.

| Action | Desktop | Touch | Command |
|---|---|---|---|
| select hero | 1–4, click card, click hero | tap card, tap hero | none |
| move | right-click ground | tap ground (when not targeting) | `move` |
| stop / hold | S / H | buttons on the ability bar | `stop` / `hold {on}` |
| ability | Q W E R = slots 0–3, or click button | tap button | per targeting, below |
| autocast | Ctrl+key or right-click button | long-press button (500 ms) | `autocast {on: !current}` |
| arm trigger | Alt+key or the arm toggle then key | arm toggle, then button | see 7d |
| cancel | Esc, right-click while targeting | tap the button again, or cancel chip | none |
| pause | P / Space | pause button | none (local only) |

Targeting comes from presentation content per ability effect:
- `instant` (Furnace Heart, taunt, heal): casts on press.
- `direction` (Vent, Suppressing Fire, Brace facing): the cone or arc follows the cursor from the hero; click/tap confirms with `x, y`.
- `point` (pull): a radius preview at the cursor, clamped to range; confirm sends `x, y`.
- `unit` (mark): hover highlights hostiles; confirming on a unit sends `target`, and confirming on ground sends none, so the kit picks the nearest.

On touch, targeting also accepts **drag from the button onto the map and release** (one gesture), as well as tap button then tap map. Quick-cast (cast at the cursor on key press) is a desktop setting, off by default and kept in `localStorage` (try/catch). Picking uses `camera.screenToWorld` and the nearest entity within its radius plus a slop of 8 px (mouse) or 22 px (touch). The canvas uses `touch-action: none` and Pointer Events only.

Autocast state is read from `HeroView.autocast` (added in contracts). The Gunner kit ignores its autocast mask today (B-LNDY7YQ3SK4OCDAT), so the toggle is visible and sent but changes nothing for her yet.

### HUD (7c)
lit-html over the canvas, rendered from a pure `HudModel` and re-rendered at most once per sim tick (the canvas still draws every frame).
- **Top bar:** wave n/total, next-wave countdown with the preview (`p.wave.preview` groups as enemy glyph × count; empty in Director mode, which shows "?"), Ancient hp bar, pause, and a link to the viewer.
- **Hero cards (4):** colour swatch and name from presentation, hp bar, one bar per `resources[]` entry with marks drawn at `ResourceView.marks` (heat: pierce 60%, overpen 85%, overheat 100%), status icons (glyph + colour from presentation, a ring for time left from `until`), a "you" or "bot" badge, and the selected outline.
- **Ability bar (selected hero):** one button per `abilities[]` entry, with label and hotkey, a cooldown sweep (conic-gradient from `cooldownLeft / cooldownTicks`), a ready glow, an autocast pip, and the targeting mode shown by an icon. Then stop, hold and arm.
- **End overlay:** the result (win or loss, wave) and Restart.
- **Kit-agnostic rule:** nothing in `shell/` switches on hero def, kit or effect names. Unknown effects, resources, statuses or heroes fall back: label = id, colour = hashed hue, targeting = `point` when `range > 0 && radius > 0`, `unit` when `range > 0`, else `instant`. A new hero with no presentation entry is playable; an entry only makes it nicer.

### Presentation content (`src/content/presentation.ts`)
Pure data plus fallback lookups, not part of `GameConfig`, not hashed, not overridable:
- `abilities: {effect, label, glyph, targeting, armable, intentKind?}[]`. Armable means it can be posted as an intent. `intentKind` defaults to the effect; pull → `'pull'` so bots respond.
- `resources: {name, label, color}[]`
- `statuses: {id, label, glyph, color, harmful}[]`
- `heroes` and `enemies: {id, label, color, shape?}[]`

**Perception additions (contracts slice; additive, not hashed, golden unchanged):** `AbilityView.cooldownTicks` (the full cooldown, 0 if none), `ResourceView.marks` (band thresholds 0..1; the Gunner gets pierceAbove, overpenAbove, 1), and `HeroView.autocast` (bitmask). These are player-visible facts. Marks make costs visible before commitment (pillar 1).

### Arming triggers (7d)
An armed trigger is an `intent post`, the same object bots use (§6.3).
- **Arm:** select a driven hero, toggle Arm (or Alt+key), then pick an `armable` ability. Aim it like a `point` or `direction` cast. A fire-time picker then appears at the point: default 2 s, range 1–5 s in 0.5 s steps (wheel or +/− chips), with a countdown ring in the world. Confirm sends `intent post {hero, slot, intentKind, x, y, fireIn: ticks(s)}`. Esc or cancel backs out.
- **Live intents:** world markers (point, kind glyph, ring that empties toward `fireTick`, reserver pips by hero colour) and a compact list in the HUD.
- **Reserve:** tap or click a teammate's (bot's) intent marker or list row, then choose one of your hero's abilities. That sends `intent reserve {hero, intent, slot, offset: 0}`; offset is +0.5 s steps with a 0 default. Shown as your pip on the marker.
- **Cancel:** your own pending intent or reservation has an ✕ that sends `intent cancel`.
- The reducer refuses (no command, a brief HUD hint) where the board would only log a no-op: a second pending post by the same hero, reserving your own intent, reserving after `fireTick`. The sim stays the authority. The hint is UX, not a rule copy, so the board can change without breaking the client.
- Lead: the reserve lead time matters (L-KQN4NFNYHTDB6VAL). The picker's 1 s minimum exceeds the 0.4 s bot reaction.

### Testing (invariants and engine behaviour only, D-4E4QRJ7N6LIGZDSD)
Node (`test/client/shell/*.test.ts`):
- camera: `screenToWorld(worldToScreen(p)) ≈ p` in both orientations; the whole map lies inside the free viewport; rotation is chosen by aspect.
- frame: alpha in [0, 1); steps capped; gap clamp; pause gives 0 steps; same inputs give the same plan.
- interp: alpha 0 gives prev and alpha 1 gives curr; spawned and removed entities are handled; output in id order.
- instances and scene: every float finite; stride constant; buffer growth keeps data; scene of a real match at several ticks emits only known shape ids.
- controls and arming: every emitted command passes `isValidCommand`; no command for bot or dead heroes; Esc returns to idle; targeting modes come from presentation (tested with a synthetic presentation, not the shipped one).
- presentation: every effect, resource and status in the shipped content has an entry (completeness invariant); fallbacks work for an unknown id.
- hudmodel: buttons equal `abilities.length` for each hero; fractions in [0, 1].
- sink determinism: a match with `humans: [0]` driven by a scripted `UiAction` sequence through `localSink` gives a `cmd` log; a fresh sim fed those `cmd` events reproduces the same hash sequence.
- run: `humans` validation; a seatless slot gets no bot commands.

Browser (`*.browser.test.ts`, chromium, firefox and webkit, listed in `BROWSER_TESTS`):
- gl: the program compiles and links, and one instance of each shape draws non-background pixels (`readPixels`); resize keeps the DPR backing size; `WEBGL_lose_context` sets `lost` and does not throw.
- shell: mounts, the tick advances, 4 hero cards, and as many ability buttons as perception says; a synthetic `KeyboardEvent('q')` and a pointer sequence reach a spy sink as valid commands; portrait (390×844) and landscape (844×390) containers produce the expected rotation.
- If an engine's headless WebGL2 is unavailable, the shell test asserts the "WebGL2 unavailable" fallback in that engine instead of skipping (see Risks).

## Slices

| step | slice | owned files | depends on | exit check | size |
|---|---|---|---|---|---|
|1|w7-contracts|`src/client/shell/types.ts`; stubs with final signatures for every step-2 file below (each owned by its step-2 slice after this); `src/content/presentation.ts`; `src/perception/{types,perceive}.ts` (cooldownTicks, marks, autocast); `src/match/run.ts` (`humans`); `play.html` (canvas + HUD root + base layout CSS); `vite.config.ts` (multi-page input, BROWSER_TESTS entries for the new browser tests); `knip.jsonc` (play.html entry); `test/match/run.test.ts`; `test/client/shell/presentation.test.ts`|—|`npm run ci` green, golden unchanged; `play.html` loads and shows the stub shell|M|
|2a|w7-gl|`src/client/gl/{context,shaders,renderer,instances}.ts`, `test/client/gl/instances.test.ts`, `test/client/gl.browser.test.ts`|types.ts instance layout, Camera.matrix|all shapes draw in 3 browsers (or fallback recorded); context loss handled|M|
|2b|w7-viewmath|`src/client/shell/{frame,snapshot,interp,camera}.ts`, `test/client/shell/{frame,interp,camera}.test.ts`|types.ts|camera round trip and fit, frame and interp invariants green|S–M|
|2c|w7-scene|`src/client/shell/{scene,palette}.ts`, `test/client/shell/scene.test.ts`|types.ts, presentation, `intentfx.ts` signature|scene of a real match emits finite, known-shape instances with pixel floors|M|
|2d|w7-input|`src/client/shell/{controls,input}.ts`, `test/client/shell/controls.test.ts`|types.ts, presentation, `arming.reduce` signature, Camera|reducer invariants green; keymap and touch gestures per the table|M|
|2e|w7-hud|`src/client/shell/{hudmodel,hud}.ts`, `src/client/shell/hud.css`, `test/client/shell/hudmodel.test.ts`|types.ts, presentation, `intentsui.ts` signature|hudmodel invariants; HUD lays out at 390×844 and 1280×720 with no overlap of the free map area|M|
|2f|w7-arming|`src/client/shell/{arming,intentsui,intentfx}.ts`, `test/client/shell/arming.test.ts`|types.ts, presentation|post, reserve and cancel commands valid; refusal hints; markers finite|M|
|2g|w7-shell|`src/client/shell/{main,app,config,sink}.ts`, `src/client/app.ts` (play link only), `test/client/shell/{config,sink}.test.ts`, `test/client/shell.browser.test.ts`|all step-2 signatures (stubs exist)|sink determinism test green; shell browser test green in 3 browsers|M|
|3|lead|wiring fixes, STATE evidence, screenshots|all|demo below; `npm run ci` green; Opus review|—|

The rule from §8 holds: no file has two owners in a step. Step-2 slices code against the step-1 stubs, so 2g's wiring compiles from day one and lights up as the others land. Merge order inside step 2 does not matter. 2g is merged last only if it needs another slice's behaviour for its browser test.

**Step-3 demo (evidence for the criteria):**
1. Open `play.html#drive=0` in Playwright at 390×844 (touch emulation) and 1280×720; screenshot both.
2. Drive the Gunner: move, Brace toward the lane, Vent at a clump, toggle hold, all via synthetic input. The event log shows only `cmd` events from player 0.
3. Drive the support (`drive=3`): arm a pull 2 s ahead on a clump; the bot Gunner's `intent reserve` follows, then `fire` and `fulfil`.
4. The debug viewer at `index.html` still runs, and its browser tests pass.

## Alternatives considered
- **Replace the debug viewer with the shell:** loses the bot and Director panels B uses on Pages, and couples a debugging tool to game UX. A second page costs one Vite input.
- **A renderer toggle inside the viewer:** mixes page layout with game layout. It can still come later, by mounting `gl/renderer.ts` in the viewer.
- **HUD reads kit state directly (`kit.heat`):** that is what `hud.ts` in the viewer does. It breaks the kit-agnostic rule and shows bots what players cannot see. Perception already exists for this.
- **Cooldown fraction by remembering the largest `cooldownLeft` seen:** avoids touching perception, but it is wrong after a reload or a mid-cooldown join. One additive field is cleaner.
- **Separate draw calls per shape, or a sprite atlas:** no art assets yet, and one SDF program keeps the renderer small and themeable.
- **A pan and zoom camera:** the map fits one screen. It adds a gesture conflict with drag-to-aim on touch.
- **A human seat inside `Match`:** a sink outside Match keeps Match all-bot and pure, and maps one-to-one onto the lockstep transport later.
- **Arming as a separate mode screen:** heavier. One toggle reuses the normal targeting flow.

## Risks & open questions
- **Headless WebGL2 in Firefox and WebKit on CI** may be missing (software GL). The gl slice checks first. If an engine lacks it, its browser test asserts the fallback message, and the lead records the gap and does a manual check on a real device.
- **Touch precision on phones:** entities are a few pixels across. Mitigations are pixel floors, touch slop, cards as the main selector, and drag-to-aim. If the step-3 screenshots show it is unplayable, a follow-hero zoom is the first follow-up.
- **The Gunner ignores autocast (B-LNDY7YQ3SK4OCDAT):** the UI sends the toggle; the effect lands with wave 8a.
- **Replaying a driven game:** `bhd view` rebuilds from the spec only, so human commands are not replayed. Wave 8 feeds logged human `cmd` events back in (backlog at finalize).
- **Hero kits change in wave 6/8b:** covered by presentation fallbacks and the perception contract. A kit only has to fill `abilities`, `resources` and `marks` in perceive.
- **lit-html re-render cost on low-end phones:** capped at 30 Hz; measured in step 3.

Open questions for B (mechanics and platform only; the lead proceeds on the defaults meanwhile):
1. **Focus target:** heroes pick their own targets, and there is no attack command. Should a human be able to order "attack this enemy" (a new sim command, WC3-style), or is target choice deliberately automatic? Default: no attack command in wave 7; right-click or tap on an enemy moves toward it.
2. **Platform priority (§10 Q4):** the shell is built for both equally, with portrait-first touch layout. Say if one should lead.
