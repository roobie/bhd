// Turns sim events into log lines for the debug viewer. Pure. `cmd`, `choice` and `intent` lines
// can be filtered; the other kinds worth reading are always shown.

import type { SimEvent } from '../sim/events.ts';

/** Names known so far, by entity id (from `spawn` events), so dead entities still have a name. */
export type NameBook = Map<number, string>;

type LogCategory = 'cmd' | 'choice' | 'intent' | 'other';

export interface LogLine {
  readonly cat: LogCategory;
  readonly text: string;
}

export type LogFilters = Readonly<Record<'cmd' | 'choice' | 'intent', boolean>>;

function name(book: NameBook, id: number): string {
  return id === 0 ? 'none' : (book.get(id) ?? `#${id}`);
}

/** `{kind, a, b}` as `a=1 b=2`, without the kind. */
function fields(obj: object): string {
  return Object.entries(obj)
    .filter(([k]) => k !== 'kind')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ');
}

/** A log line for the event, or undefined if the viewer does not log this kind. */
function describeEvent(book: NameBook, event: SimEvent): LogLine | undefined {
  switch (event.kind) {
    case 'cmd':
      return { cat: 'cmd', text: `p${event.player} ${event.cmd.kind} ${fields(event.cmd)}` };
    case 'choice':
      return {
        cat: 'choice',
        text: `${name(book, event.hero)} ${event.decision} -> ${event.picked} [${event.options
          .map((o) => `${o.id} ${o.score.toFixed(2)}`)
          .join(', ')}]`,
      };
    case 'intent':
      return {
        cat: 'intent',
        text: `intent #${event.id} ${event.op} ${event.intentKind} by ${name(book, event.by)}`,
      };
    case 'wave':
      return { cat: 'other', text: `wave ${event.n} ${event.phase}` };
    case 'death':
      return { cat: 'other', text: `${name(book, event.id)} died (killer ${name(book, event.killer)})` };
    case 'leak':
      return { cat: 'other', text: `${name(book, event.id)} leaked, -${event.livesLost} hp` };
    case 'end':
      return { cat: 'other', text: `game over: ${event.reason} (wave ${event.wave})` };
    case 'ability':
      return { cat: 'other', text: `${name(book, event.hero)} ability ${event.slot} -> ${name(book, event.target)}` };
    default:
      return undefined;
  }
}

/** Appends described events to `log` as `t<tick> text`, keeping the last `max` lines of each category. */
export function pushEvents(log: LogLine[], book: NameBook, events: readonly SimEvent[], max: number): void {
  for (const e of events) {
    if (e.kind === 'spawn') {
      book.set(e.id, `${e.def}#${e.id}`);
    }
    const line = describeEvent(book, e);
    if (line !== undefined) {
      log.push({ cat: line.cat, text: `t${e.tick} ${line.text}` });
    }
  }
  trimPerCategory(log, max);
}

/** Drops the oldest lines of any category that has more than `max`, so a chatty one cannot crowd out the rest. */
function trimPerCategory(log: LogLine[], max: number): void {
  const excess = new Map<LogCategory, number>();
  for (const l of log) {
    excess.set(l.cat, (excess.get(l.cat) ?? 0) + 1);
  }
  for (const [cat, n] of excess) {
    excess.set(cat, Math.max(0, n - max));
  }
  if ([...excess.values()].every((n) => n === 0)) {
    return;
  }
  const kept = log.filter((l) => {
    const n = excess.get(l.cat) ?? 0;
    if (n > 0) {
      excess.set(l.cat, n - 1);
      return false;
    }
    return true;
  });
  log.splice(0, log.length, ...kept);
}

/** The last `max` lines whose category is not filtered off. */
export function visibleLines(log: readonly LogLine[], filters: LogFilters, max: number): LogLine[] {
  const out: LogLine[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < max; i--) {
    const line = log[i];
    if (line !== undefined && (line.cat === 'other' || filters[line.cat])) {
      out.push(line);
    }
  }
  return out.reverse();
}
