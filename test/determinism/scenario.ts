// The shared determinism scenario. Runs unchanged in Node and in browsers (no Node imports), and
// browsers compare their result to the one Node computes in reference.setup.ts: that is how "browser matches Node" is proven.

import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultDirector, defaultMaster } from '../../src/content/director.ts';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame, defaultMasterGame } from '../../src/content/index.ts';
import {
  atan2,
  cos,
  createRng,
  deriveRng,
  hypot,
  nextFloat,
  nextInt,
  nextU32,
  PI,
  sin,
} from '../../src/detmath/index.ts';
import { shellSpec } from '../../src/client/shell/config.ts';
import { Match } from '../../src/match/match.ts';
import type { GameSpec } from '../../src/match/run.ts';
import { buildMatch } from '../../src/match/run.ts';
import { replayInputs } from '../../src/net/inputlog.ts';
import type { Seal, SealedInput } from '../../src/net/types.ts';
import type { Command } from '../../src/sim/commands.ts';
import { SYSTEM_PLAYER } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { StateHasher } from '../../src/sim/hash.ts';
import { Sim } from '../../src/sim/sim.ts';
import { testBargains } from '../bargains-fixture.ts';

export const SEED = 0x5e_ed_12_34;
export const TICKS = 1800;
/** Ticks of the Match run (default bots and Director, master mode). */
const MATCH_TICKS = 3000;
const HASH_EVERY = 37;
/** Ticks of the master-mode script run. */
export const MASTER_TICKS = 1300;

export interface Scripted {
  readonly tick: number;
  readonly player: number;
  readonly cmd: Command;
}

/**
 * A derived config, small enough to reach a leak, wave ends and the game's end within TICKS: a
 * short lane (the default one's last stretch), a weak Ancient, three short waves, and a Gunner
 * that heats up faster so one run crosses every heat band and overheats.
 */
function scenarioGame(): GameConfig {
  const base = defaultGame();
  const [gunner, penitent, psyker, support] = base.heroes;
  if (gunner?.kit !== 'gunner' || penitent === undefined || psyker === undefined || support === undefined) {
    throw new Error('default lineup changed');
  }
  return {
    ...base,
    map: { ...base.map, lane: base.map.lane.slice(5), ancient: { ...base.map.ancient, maxHp: 8 } },
    // A frail support seat, so the run includes a hero going down and coming back.
    heroes: [{ ...gunner, heat: { ...gunner.heat, perShot: 0.04 } }, penitent, psyker, { ...support, maxHp: 5 }],
    waves: {
      firstDelay: 5,
      interval: 14,
      waves: [
        { spawns: [{ def: 'grunt', count: 6, gap: 0.5 }] },
        {
          spawns: [
            { def: 'brute', count: 2, gap: 2 },
            { def: 'grunt', count: 4, gap: 0.5 },
          ],
        },
        {
          spawns: [
            { def: 'runner', count: 6, gap: 0.3 },
            { def: 'grunt', count: 4, gap: 0.5 },
          ],
        },
      ],
    },
  };
}

// defaultGame() ids: Ancient 1, then the lineup gunner 2, penitent 3, psyker 4, support 5; debug spawns
// below get 6, 7, 8, ... in order. Each kit casts at least once (Pavise, Chain, Lash, support heal). Waves start on their own at tick 150.
/** Several players, some on the same tick, hero commands of every kind, targets near and far. */
export const SCRIPT: readonly Scripted[] = [
  { tick: 1, player: 0, cmd: { kind: 'spawn', def: 'grunt', x: 70, y: 25 } },
  { tick: 1, player: 1, cmd: { kind: 'spawn', def: 'brute', x: 72, y: 31.5 } },
  { tick: 1, player: 2, cmd: { kind: 'spawn', def: 'runner', x: -5.5, y: 8.25 } },
  { tick: 2, player: 1, cmd: { kind: 'move', hero: 3, x: 70, y: 28 } },
  { tick: 2, player: 0, cmd: { kind: 'move', hero: 2, x: 60 + 1 / 3, y: 21 } },
  // The Gunner braces and at once unbraces (rooted until tick 34), so the same-tick moves at tick 40 still take effect.
  { tick: 3, player: 2, cmd: { kind: 'ability', hero: 2, slot: 0, x: 50, y: 20 } },
  { tick: 4, player: 2, cmd: { kind: 'ability', hero: 2, slot: 0 } },
  { tick: 5, player: 2, cmd: { kind: 'move', hero: 4, x: 76.5, y: 24 } },
  { tick: 5, player: 2, cmd: { kind: 'hold', hero: 5, on: true } },
  { tick: 17, player: 0, cmd: { kind: 'spawn', def: 'grunt', x: 60.456, y: 5.9 } },
  { tick: 18, player: 1, cmd: { kind: 'move', hero: 5, x: 80.1, y: 27.2 } },
  { tick: 18, player: 0, cmd: { kind: 'move', hero: 5, x: 82, y: 30 } },
  { tick: 18, player: 2, cmd: { kind: 'move', hero: 99, x: 1, y: 1 } },
  // Same player, same tick: only the submission order (seq) says which target wins.
  { tick: 40, player: 0, cmd: { kind: 'move', hero: 2, x: 55, y: 30.7 } },
  { tick: 40, player: 0, cmd: { kind: 'move', hero: 2, x: 58, y: 27 } },
  { tick: 120, player: 0, cmd: { kind: 'ability', hero: 2, slot: 2, x: 40, y: 28 } },
  { tick: 130, player: 0, cmd: { kind: 'ability', hero: 2, slot: 1, x: 40, y: 28 } },
  { tick: 40, player: 1, cmd: { kind: 'move', hero: 3, x: 70 + 2 / 3, y: 28 - 1 / 7 } },
  { tick: 41, player: 2, cmd: { kind: 'spawn', def: 'grunt', x: 2, y: 2 } },
  { tick: 62, player: 0, cmd: { kind: 'spawn', def: 'brute', x: 80, y: 28 } },
  { tick: 50, player: 0, cmd: { kind: 'ability', hero: 4, slot: 3, target: 6 } },
  { tick: 55, player: 1, cmd: { kind: 'autocast', hero: 3, slot: 1, on: true } },
  { tick: 55, player: 1, cmd: { kind: 'autocast', hero: 3, slot: 2, on: false } },
  // Negative zero: JSON turns it into 0, so the sim must have normalised it before logging.
  { tick: 60, player: 1, cmd: { kind: 'spawn', def: 'runner', x: -0, y: -0 } },
  { tick: 61, player: 1, cmd: { kind: 'move', hero: 5, x: -0, y: 25 } },
  { tick: 151, player: 1, cmd: { kind: 'move', hero: 5, x: 80, y: 31 } },
  { tick: 61, player: 1, cmd: { kind: 'ability', hero: 4, slot: 1, x: -0, y: -0 } },
  { tick: 90, player: 1, cmd: { kind: 'stop', hero: 2 } },
  { tick: 100, player: 1, cmd: { kind: 'hold', hero: 5, on: false } },
  { tick: 150, player: 2, cmd: { kind: 'move', hero: 3, x: 73.5, y: 32 } },
  { tick: 150, player: 0, cmd: { kind: 'move', hero: 2, x: 77, y: 32 } },
  { tick: 299, player: 1, cmd: { kind: 'hold', hero: 4, on: true } },
  { tick: 600, player: 1, cmd: { kind: 'hold', hero: 4, on: false } },
  { tick: 830, player: 2, cmd: { kind: 'ability', hero: 2, slot: 3 } },
  { tick: 840, player: 2, cmd: { kind: 'ability', hero: 3, slot: 3 } },
  { tick: 850, player: 0, cmd: { kind: 'ability', hero: 4, slot: 0, x: 74, y: 30 } },
  // Stand-in abilities (taunt, mark, heal, pull) and a hot Vent, timed to the waves.
  // The third wave is called early (two players, same tick: one call), then the casts.
  { tick: 930, player: 1, cmd: { kind: 'callWave' } },
  { tick: 930, player: 2, cmd: { kind: 'callWave' } },
  { tick: 300, player: 0, cmd: { kind: 'ability', hero: 3, slot: 0 } },
  { tick: 320, player: 1, cmd: { kind: 'ability', hero: 4, slot: 0 } },
  { tick: 330, player: 2, cmd: { kind: 'ability', hero: 5, slot: 1, x: 72, y: 33 } },
  { tick: 400, player: 0, cmd: { kind: 'ability', hero: 5, slot: 0 } },
  { tick: 545, player: 1, cmd: { kind: 'ability', hero: 2, slot: 1, x: 70, y: 34 } },
  { tick: 800, player: 0, cmd: { kind: 'ability', hero: 5, slot: 0 } },
  // A Pavise between the Gunner (east) and the melee crowd: the Penitent steps behind it, so enemy
  // hits across it are blocked and the Gunner's overpenetrating line is clipped (`block` events).
  { tick: 640, player: 1, cmd: { kind: 'move', hero: 3, x: 75.4, y: 32 } },
  { tick: 650, player: 0, cmd: { kind: 'ability', hero: 2, slot: 2, x: 74, y: 32 } },
  // Everyone holds fire as the third wave arrives, so it leaks and destroys the weak Ancient
  // (debug-spawned idle enemies never die, so victory is out of reach: this ends the game).
  { tick: 1005, player: 1, cmd: { kind: 'move', hero: 2, x: 77, y: 18 } },
  { tick: 1005, player: 1, cmd: { kind: 'move', hero: 3, x: 73.5, y: 18 } },
  { tick: 1005, player: 1, cmd: { kind: 'move', hero: 4, x: 76.5, y: 18 } },
  { tick: 1005, player: 1, cmd: { kind: 'move', hero: 5, x: 80, y: 18 } },
  { tick: 1010, player: 1, cmd: { kind: 'hold', hero: 2, on: true } },
  { tick: 1010, player: 1, cmd: { kind: 'hold', hero: 3, on: true } },
  { tick: 1010, player: 1, cmd: { kind: 'hold', hero: 4, on: true } },
  { tick: 1010, player: 1, cmd: { kind: 'hold', hero: 5, on: true } },
];

/** The scenario game in master mode (wave master seat 4, default budget and costs). */
function masterScenarioGame(): GameConfig {
  // Interval 20 s (the shipped one): longer than the master's send interval, so an early call has a window.
  const base = scenarioGame();
  return { ...base, waves: { ...base.waves, interval: 20 }, master: defaultMaster() };
}

/**
 * Master-mode script: the intents board (post, reserve, cancel; the fire runs `ctx.cast`) and the
 * wave master (summon, send). Heroes: gunner 2, tank 3, ranged 4, support 5; the first post is
 * intent 1, the second 2, the third 3. `send` is allowed from `minIntervalSeconds` (tick 300).
 */
const MASTER_SCRIPT: readonly Scripted[] = [
  { tick: 3, player: 4, cmd: { kind: 'summon', def: 'grunt', count: 3 } },
  { tick: 4, player: 4, cmd: { kind: 'summon', def: 'brute', count: 1 } },
  { tick: 5, player: 4, cmd: { kind: 'summon', def: 'nonesuch', count: 1 } },
  {
    tick: 10,
    player: 0,
    cmd: { kind: 'intent', op: 'post', hero: 2, slot: 1, intentKind: 'vent', x: 60, y: 28, fireIn: 30 },
  },
  { tick: 12, player: 1, cmd: { kind: 'intent', op: 'reserve', hero: 3, intent: 1, slot: 0, offset: 5 } },
  { tick: 14, player: 2, cmd: { kind: 'intent', op: 'reserve', hero: 5, intent: 1, slot: 1, offset: 12 } },
  {
    tick: 20,
    player: 2,
    cmd: { kind: 'intent', op: 'post', hero: 4, slot: 0, intentKind: 'mark', x: 70, y: 30, fireIn: 60 },
  },
  { tick: 25, player: 2, cmd: { kind: 'intent', op: 'cancel', hero: 4, intent: 2 } },
  {
    tick: 26,
    player: 1,
    cmd: { kind: 'intent', op: 'post', hero: 3, slot: 0, intentKind: 'taunt', x: 72, y: 31, fireIn: 20 },
  },
  { tick: 27, player: 1, cmd: { kind: 'intent', op: 'cancel', hero: 5, intent: 1 } },
  {
    tick: 150,
    player: 0,
    cmd: { kind: 'intent', op: 'post', hero: 5, slot: 1, intentKind: 'heal', x: 72, y: 33, fireIn: 15 },
  },
  { tick: 299, player: 4, cmd: { kind: 'send' } },
  { tick: 310, player: 4, cmd: { kind: 'send' } },
  { tick: 320, player: 4, cmd: { kind: 'summon', def: 'runner', count: 4 } },
  { tick: 330, player: 4, cmd: { kind: 'summon', def: 'runner', count: 2 } },
  // Master mode: callWave starts the pending wave now, like `send` (both throttles permitting).
  { tick: 590, player: 4, cmd: { kind: 'summon', def: 'runner', count: 3 } },
  { tick: 600, player: 0, cmd: { kind: 'callWave' } },
  { tick: 700, player: 4, cmd: { kind: 'send' } },
  { tick: 701, player: 4, cmd: { kind: 'summon', def: 'grunt', count: 2 } },
  { tick: 1100, player: 4, cmd: { kind: 'send' } },
];

/** Runs `MASTER_SCRIPT` on a fresh master-mode sim, every command submitted up front. */
export function runMasterSim(seed: number, ticks: number): SimEvent[] {
  return drive(
    { seed, game: masterScenarioGame() },
    ticks,
    (sim) => {
      for (const s of MASTER_SCRIPT) {
        submit(sim, s, s.tick);
      }
    },
    () => undefined,
  );
}

/** Seconds an offer stays open in the bargain run: short, so the unanswered offer lapses within the run. */
const BARGAIN_WINDOW = 4;

/** The scenario game (four plain waves that end one after another, a tougher Ancient) with the test-only bargain pool (the shipped one is slice B's). */
function bargainsScenarioGame(): GameConfig {
  const base = scenarioGame();
  return {
    ...base,
    map: { ...base.map, ancient: { ...base.map.ancient, maxHp: 400 } },
    waves: { ...base.waves, waves: [1, 2, 3, 4].map(() => ({ spawns: [{ def: 'grunt', count: 4, gap: 0.5 }] })) },
    bargains: { ...testBargains(), afterWaves: [1, 2, 3], cards: 5, windowSeconds: BARGAIN_WINDOW },
  };
}

/**
 * Answers the offers as they open, from the sim's own state (an offer's tick and cards depend on the
 * seeded draw): offer 1 is accepted (the timed card if it was drawn), offer 2 is declined, offer 3 and
 * later are left to lapse. Also fires commands that resolve nothing (unknown offer and card, a repeat).
 */
function answerOffers(sim: Sim, tick: number): void {
  for (const offer of sim.bargains?.offers ?? []) {
    if (tick !== offer.expiresAt - Math.round(BARGAIN_WINDOW * 30) + 5) {
      continue;
    }
    const card = offer.cards.find((c) => c.bargain === 'test-fleeting') ?? offer.cards[0];
    if (offer.id === 1 && card !== undefined) {
      // A hero-bound card is accepted as its hero's slot (the sim's bargain ownership rule).
      const owner = sim.entities.get(card.hero);
      const player = owner === undefined ? 2 : sim.game.heroes.findIndex((h) => h.id === owner.def);
      submit(sim, { tick, player, cmd: { kind: 'bargain', op: 'accept', offer: offer.id, card: card.bargain } });
      submit(sim, { tick, player: 3, cmd: { kind: 'bargain', op: 'decline', offer: offer.id } });
    } else if (offer.id === 2) {
      submit(sim, { tick, player: 4, cmd: { kind: 'bargain', op: 'decline', offer: offer.id } });
      submit(sim, { tick, player: 5, cmd: { kind: 'bargain', op: 'accept', offer: offer.id, card: 'nonesuch' } });
    }
  }
  if (tick === 3) {
    submit(sim, { tick, player: 3, cmd: { kind: 'bargain', op: 'accept', offer: 99, card: 'nonesuch' } });
  }
}

/** Runs the scenario game with bargains configured, answering offers as they open. */
export function runBargainSim(seed: number, ticks: number): SimEvent[] {
  return drive({ seed, game: bargainsScenarioGame() }, ticks, () => undefined, answerOffers);
}

/** Ticks of the control-command run. */
const CONTROL_TICKS = 1800;

/**
 * Control commands through a full Match (bots, bargains), submitted the way a networked driver does
 * (just before the tick, SYSTEM_PLAYER for control, the human's own commands as player = slot): drive
 * handovers both ways, bargain policy changes, a control command from a non-system player (ignored),
 * and a human playing slot 1 while it is driven. Cross-checks that every runtime applies them alike.
 */
function runControlMatch(): MatchResult {
  const match = new Match({
    seed: SEED,
    game: bargainsScenarioGame(),
    bots: defaultBotSetup(),
    hashEvery: HASH_EVERY,
    bargainPolicy: 'human',
  });
  const hero = (slot: number): number => match.perception.heroes.find((h) => h.slot === slot)?.id ?? 0;
  const control: Readonly<Record<number, readonly (readonly [number, Command])[]>> = {
    40: [[SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 1, by: 'human' }]],
    90: [[0, { kind: 'control', op: 'drive', slot: 3, by: 'human' }]],
    200: [[SYSTEM_PLAYER, { kind: 'control', op: 'bargainPolicy', policy: 'bots' }]],
    500: [
      [SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 2, by: 'human' }],
      [SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 1, by: 'bot' }],
    ],
    900: [[SYSTEM_PLAYER, { kind: 'control', op: 'bargainPolicy', policy: 'off' }]],
    1100: [[SYSTEM_PLAYER, { kind: 'control', op: 'bargainPolicy', policy: 'human' }]],
    1300: [[SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 2, by: 'bot' }]],
  };
  const events: SimEvent[] = [];
  while (match.tick < CONTROL_TICKS && !match.ended) {
    const t = match.tick + 1;
    for (const [player, cmd] of control[t] ?? []) {
      match.sim.command(player, cmd);
    }
    if (t >= 60 && t < 500 && t % 40 === 0) {
      match.sim.command(1, { kind: 'move', hero: hero(1), x: 10 + (t % 120), y: 20 });
    }
    if (t >= 520 && t < 1300 && t % 50 === 0) {
      match.sim.command(2, { kind: 'move', hero: hero(2), x: 20 + (t % 100), y: 25 });
    }
    events.push(...match.step());
  }
  if (events.at(-1)?.kind !== 'hash') {
    events.push({ tick: match.tick, kind: 'hash', stateHash: match.sim.hash() });
  }
  return summarise(events);
}

/** Ticks of the sealed-input run: past the first offer of the early-bargain spec. */
const SEALED_TICKS = 1900;

/** A networked-style spec: two humans, an offer after wave 1, so a bot hero's card is up inside the run. */
export function sealedSpec(): GameSpec {
  return {
    ...shellSpec({ seed: SEED, mode: 'schedule', drive: [0, 1] }),
    networked: true,
    overrides: { game: { bargains: { afterWaves: [1] } } },
  };
}

export interface SealedRun {
  readonly spec: GameSpec;
  readonly seals: readonly Seal[];
  /** Every event of the live run that produced the seals. */
  readonly events: readonly SimEvent[];
}

/**
 * A host-style run: each tick it composes that tick's inputs (human moves, SYSTEM control handovers,
 * a policy flip, and a bargain accept for a card of a BOT hero submitted as that hero's slot, then a
 * decline), seals them sorted by player, submits them in seal order (rule R1) and steps. The seals
 * are what `replayInputs` plays back; every runtime must reproduce the same events from them.
 */
export function runSealed(): SealedRun {
  const spec = sealedSpec();
  const match = buildMatch(spec);
  const seals: Seal[] = [];
  const events: SimEvent[] = [];
  let answered = 0;
  while (match.tick < SEALED_TICKS && !match.ended) {
    const t = match.tick + 1;
    const inputs: SealedInput[] = [];
    const hero = (slot: number): number => match.perception.heroes.find((h) => h.slot === slot)?.id ?? 0;
    if (t % 45 === 0) {
      inputs.push({ player: 0, cmd: { kind: 'move', hero: hero(0), x: 8 + (t % 90), y: 14 } });
    }
    if (t % 70 === 0) {
      inputs.push({ player: 1, cmd: { kind: 'move', hero: hero(1), x: 30 - (t % 60), y: 18 } });
    }
    if (t === 60) {
      inputs.push({ player: SYSTEM_PLAYER, cmd: { kind: 'control', op: 'drive', slot: 1, by: 'bot' } });
    }
    if (t === 400) {
      inputs.push({ player: SYSTEM_PLAYER, cmd: { kind: 'control', op: 'drive', slot: 1, by: 'human' } });
    }
    if (t === 800) {
      inputs.push({ player: SYSTEM_PLAYER, cmd: { kind: 'control', op: 'bargainPolicy', policy: 'human' } });
    }
    const offer = match.sim.bargains?.offers[0];
    if (offer !== undefined && answered < 2) {
      // The bot hero's card first (accepted by a human as the hero's slot), the leftovers declined.
      const bot = offer.cards.find((c) => {
        const slot = match.perception.heroes.find((h) => h.id === c.hero)?.slot;
        return slot !== undefined && !match.driven.includes(slot);
      });
      const slot = match.perception.heroes.find((h) => h.id === bot?.hero)?.slot;
      if (bot !== undefined && slot !== undefined) {
        inputs.push({ player: slot, cmd: { kind: 'bargain', op: 'accept', offer: offer.id, card: bot.bargain } });
      } else {
        inputs.push({ player: 1, cmd: { kind: 'bargain', op: 'decline', offer: offer.id } });
      }
      answered += 1;
    }
    inputs.sort((a, b) => a.player - b.player);
    seals.push({ tick: t, inputs });
    for (const input of inputs) {
      match.sim.command(input.player, input.cmd, t);
    }
    events.push(...match.step());
  }
  return { spec, seals, events };
}

interface MatchResult {
  /** `stateHash` of every hash event, in order. */
  readonly hashes: readonly string[];
  /** Digest of the full event stream, `choice` events included. */
  readonly eventDigest: string;
}

export interface ScenarioResult {
  /** Master-mode script (intents board, `ctx.cast`, summon, send): cross-checks board and master hashing. */
  readonly master: MatchResult;
  /** Bargains configured with a test-only pool, bargain commands scripted: cross-checks the bargain state hash and command path. */
  readonly bargains: MatchResult;
  /** A Match with control commands (drive handovers, bargain policy) and a human's commands submitted per tick. */
  readonly control: MatchResult;
  /** `replayInputs` of the seals of a host-style run (control handovers, a bot hero's card accepted as its slot). */
  readonly sealed: MatchResult;
  /** Bargain accepts in those seals; the scenario must exercise the bot-hero accept path. */
  readonly sealedAccepts: number;
  /** An all-bot Match with the default bots and Director: any bot or Director change moves it. */
  readonly match: MatchResult;
  /** `stateHash` of every hash event, in order. */
  readonly hashes: readonly string[];
  /** Digest of the full event stream (every event, every field). */
  readonly eventDigest: string;
  /** detmath outputs: RNG draws, then trig values, as `String(x)` (shortest text that round-trips the double). */
  readonly detmath: readonly string[];
  /** Bitwise digest of detmath over a dense sweep plus edge values (tiny, huge, ±0, axes, infinities). */
  readonly detmathSweep: string;
}

/** Hashes the JSON text of `value` code unit by code unit. */
function digestOf(value: unknown): string {
  const text = JSON.stringify(value);
  const h = new StateHasher();
  h.u32(text.length);
  for (let i = 0; i < text.length; i++) {
    h.u32(text.charCodeAt(i));
  }
  return h.digest();
}

function submit(sim: Sim, s: Scripted, tick?: number): void {
  const res = sim.command(s.player, s.cmd, tick);
  if (!res.ok) {
    throw new Error(`command rejected at tick ${s.tick}: ${res.reason}`);
  }
}

/**
 * Steps a fresh sim `ticks` times and returns every event, then one final `hash` event so the
 * last ticks (when `ticks` is not a multiple of HASH_EVERY) are covered too.
 */
function drive(
  init: { readonly seed: number; readonly game: GameConfig },

  ticks: number,
  setup: (sim: Sim) => void,
  beforeTick: (sim: Sim, tick: number) => void,
): SimEvent[] {
  const sim = new Sim({ ...init, hashEvery: HASH_EVERY });
  setup(sim);
  const events: SimEvent[] = [];
  for (let i = 1; i <= ticks; i++) {
    beforeTick(sim, i);
    events.push(...sim.step());
  }
  if (ticks % HASH_EVERY !== 0) {
    events.push({ tick: sim.tick, kind: 'hash', stateHash: sim.hash() });
  }
  return events;
}

/** Runs `script` on a fresh sim, every command submitted up front with its tick. */
export function runSim(seed: number, script: readonly Scripted[], ticks: number): SimEvent[] {
  return drive(
    { seed, game: scenarioGame() },
    ticks,
    (sim) => {
      for (const s of script) {
        submit(sim, s, s.tick);
      }
    },
    () => undefined,
  );
}

/** Like `runSim`, but each command is submitted just before its tick runs (default tick), as a live client would. */
export function runSimInterleaved(seed: number, script: readonly Scripted[], ticks: number): SimEvent[] {
  return drive(
    { seed, game: scenarioGame() },
    ticks,
    () => undefined,
    (sim, tick) => {
      for (const s of script) {
        if (s.tick === tick) {
          submit(sim, s);
        }
      }
    },
  );
}

export function hashesOf(events: readonly SimEvent[]): string[] {
  return events.flatMap((e) => (e.kind === 'hash' ? [e.stateHash] : []));
}

/** `String(x)` (shortest round-trip text), except that negative zero stays "-0". */
function show(x: number): string {
  return Object.is(x, -0) ? '-0' : String(x);
}

const SWEEP_STEPS = 4000;
const TINY_ARGS = [7.45e-9, 7.4e-9, 7.5e-9, 1e-9, 1e-30, 1e-300, 5e-324];
const LARGE_ARGS = [1e6, 1e6 + 0.5, 1.6e6, 1.7e6, 1e7, 1e9, 2 ** 53, 1e15, 1e300];
const AXIS = [
  0,
  -0,
  1,
  -1,
  2.5,
  -2.5,
  1e-300,
  -1e-300,
  1e300,
  -1e300,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

/** Every sin/cos/atan2/hypot input worth stressing: dense sweep, tiny, large, signed zeros, axes. */
function sweepArgs(): number[] {
  const out: number[] = [0, -0, PI, -PI, PI / 2, -PI / 2, PI / 4, 3 * (PI / 2), 2 * PI];
  for (let i = -SWEEP_STEPS; i <= SWEEP_STEPS; i++) {
    out.push((i * 0.0173) / 1.3, i * 0.0731 + 0.5);
  }
  for (const a of [...TINY_ARGS, ...LARGE_ARGS]) {
    out.push(a, -a);
  }
  return out;
}

/** Hash of the exact bits of sin, cos, atan2 and hypot over `sweepArgs()` and the axis/quadrant grid. */
function detmathSweepDigest(): string {
  const h = new StateHasher();
  const args = sweepArgs();
  for (const a of args) {
    h.f64(sin(a)).f64(cos(a));
  }
  for (const y of AXIS) {
    for (const x of AXIS) {
      h.f64(atan2(y, x));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        h.f64(hypot(x, y));
      }
    }
  }
  // Stride-coprime pairing of the dense args, so atan2/hypot see many varied (y, x) quadrants.
  for (let i = 0; i < args.length; i++) {
    const y = args[i] ?? 0;
    const x = args[(i * 7919 + 13) % args.length] ?? 0;
    h.f64(atan2(y, x)).f64(hypot(x / 1e3, y / 1e3));
  }
  return h.digest();
}

function detmathValues(): string[] {
  const out: number[] = [];
  const rng = createRng(SEED);
  for (let i = 0; i < 4; i++) {
    out.push(nextU32(rng), nextFloat(rng), nextInt(rng, 1000));
  }
  out.push(nextU32(deriveRng(SEED, 'bot:3')));
  for (const a of [0.1, 1, 2.5, -3.7, 100.25, 12_345.678]) {
    out.push(sin(a), cos(a));
  }
  for (const [y, x] of [
    [1, 2],
    [-3, 0.5],
    [0.25, -7],
    [-1, -1],
  ] as const) {
    out.push(atan2(y, x), hypot(x, y));
  }
  return out.map(show);
}

/** Default brains, doctrines and Director over the default master game, for MATCH_TICKS (or to its end). */
function runMatch(): MatchResult {
  const match = new Match({
    seed: SEED,
    game: defaultMasterGame(),
    bots: defaultBotSetup(),
    director: defaultDirector(),
    hashEvery: HASH_EVERY,
  });
  const events: SimEvent[] = [];
  while (match.tick < MATCH_TICKS && !match.ended) {
    events.push(...match.step());
  }
  return { hashes: hashesOf(events), eventDigest: digestOf(events) };
}

function summarise(events: readonly SimEvent[]): MatchResult {
  return { hashes: hashesOf(events), eventDigest: digestOf(events) };
}

export function runScenario(): ScenarioResult {
  const events = runSim(SEED, SCRIPT, TICKS);
  const run = runSealed();
  return {
    sealed: summarise(replayInputs(run.spec, run.seals)),
    sealedAccepts: run.seals.flatMap((x) => x.inputs).filter((i) => i.cmd.kind === 'bargain' && i.cmd.op === 'accept').length,
    match: runMatch(),
    master: summarise(runMasterSim(SEED, MASTER_TICKS)),
    bargains: summarise(runBargainSim(SEED, TICKS)),
    control: runControlMatch(),
    hashes: hashesOf(events),
    eventDigest: digestOf(events),
    detmath: detmathValues(),
    detmathSweep: detmathSweepDigest(),
  };
}
