// Turns sim events into short log lines for the debug viewer. Pure. Only the kinds worth reading.

import type { SimEvent } from '../sim/events.ts';

/** Names known so far, by entity id (from `spawn` events), so dead entities still have a name. */
export type NameBook = Map<number, string>;

function name(book: NameBook, id: number): string {
  return id === 0 ? 'none' : (book.get(id) ?? `#${id}`);
}

/** A log line for the event, or undefined if the viewer does not log this kind. */
function describeEvent(book: NameBook, event: SimEvent): string | undefined {
  switch (event.kind) {
    case 'wave':
      return `wave ${event.n} ${event.phase}`;
    case 'death':
      return `${name(book, event.id)} died (killer ${name(book, event.killer)})`;
    case 'leak':
      return `${name(book, event.id)} leaked, -${event.livesLost} hp`;
    case 'end':
      return `game over: ${event.reason} (wave ${event.wave})`;
    case 'ability':
      return `${name(book, event.hero)} ability ${event.slot} -> ${name(book, event.target)}`;
    default:
      return undefined;
  }
}

/** Appends described events to `log` as `t<tick> text`, keeping the last `max` lines. */
export function pushEvents(log: string[], book: NameBook, events: readonly SimEvent[], max: number): void {
  for (const e of events) {
    if (e.kind === 'spawn') {
      book.set(e.id, `${e.def}#${e.id}`);
    }
    const text = describeEvent(book, e);
    if (text !== undefined) {
      log.push(`t${e.tick} ${text}`);
    }
  }
  if (log.length > max) {
    log.splice(0, log.length - max);
  }
}
