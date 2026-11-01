// The CLI summary table (step 2c), DESIGN.md §6.5 format, `← outside change` marks included.

import type { ChoiceSpreadRow, ReportData, SeriesStat } from './types.ts';

/** Movers shown in the CLI summary; the HTML report has them all. */
const MAX_ROWS = 15;
/** Share change (in points) below which a choice line is not worth printing. */
const CHOICE_MIN_POINTS = 1;

/** A number with a sensible number of digits for its size. */
export function fmtNum(x: number): string {
  const a = Math.abs(x);
  if (a >= 100) {
    return x.toFixed(0);
  }
  return a >= 1 ? x.toFixed(2) : x.toFixed(3);
}

export function fmtSigned(x: number): string {
  return `${x < 0 ? '-' : '+'}${fmtNum(Math.abs(x))}`;
}

/** Relative change as a signed percentage; `n/a` when the baseline mean is 0. */
export function fmtRel(rel: number | null): string {
  if (rel === null) {
    return 'n/a';
  }
  const p = Math.abs(rel) * 100;
  return `${rel < 0 ? '-' : '+'}${p >= 100 ? p.toFixed(0) : p.toFixed(1)}%`;
}

/** Half the width of the CI. */
export function halfWidth(s: SeriesStat): number {
  return (s.ci[1] - s.ci[0]) / 2;
}

function percent(share: number): string {
  return String(Math.round(share * 100));
}

/** The pieces of a choice line: option names, and base and cand shares as percentages. */
export function choiceParts(row: ChoiceSpreadRow): { names: string; from: string; to: string } {
  return {
    names: row.options.map((o) => o.option).join(' vs '),
    from: row.options.map((o) => percent(o.base)).join('/'),
    to: row.options.map((o) => percent(o.cand)).join('/'),
  };
}

/** `brace vs mobile  71/29 → 78/22`, led by the hero and decision. */
function choiceLine(row: ChoiceSpreadRow): string {
  const p = choiceParts(row);
  return `${row.hero} ${row.decision}: ${p.names}  ${p.from} → ${p.to}`;
}

function choiceMoved(row: ChoiceSpreadRow): boolean {
  return row.tax || row.options.some((o) => Math.abs(o.cand - o.base) * 100 >= CHOICE_MIN_POINTS);
}

function moverLine(s: SeriesStat, width: number): string {
  const label = `Δ ${s.name}`.padEnd(width);
  const change = `${fmtSigned(s.meanDiff)} ±${fmtNum(halfWidth(s))}`.padEnd(18);
  const rel = `(${fmtRel(s.rel)})`.padEnd(9);
  return `${label}  ${change}${rel}${s.outside ? '  ← outside change' : ''}`.trimEnd();
}

export function renderTable(data: ReportData): string {
  const h = data.header;
  const lines: string[] = [];
  const what = h.tags.length > 0 ? h.tags.join(', ') : h.scenario;
  lines.push(`${what}: ${h.base.label} → ${h.cand.label}    (${h.pairs} paired games)`);
  for (const w of h.warnings) {
    lines.push(`warning: ${w}`);
  }
  const byName = new Map(data.series.map((s) => [s.name, s]));
  const movers = data.movers.flatMap((n) => byName.get(n) ?? []);
  const shown = movers.slice(0, MAX_ROWS);
  const width = shown.reduce((w, s) => Math.max(w, s.name.length + 2), 0);
  for (const s of shown) {
    lines.push(moverLine(s, width));
  }
  if (movers.length === 0) {
    lines.push('no series moved beyond the noise floor');
  } else if (movers.length > shown.length) {
    lines.push(`… ${movers.length - shown.length} more movers in the HTML report`);
  }
  for (const row of data.choiceSpread.filter(choiceMoved)) {
    lines.push(`choice: ${choiceLine(row)}${row.tax ? '  ← tax (an option exceeds 90%)' : ''}`);
  }
  lines.push(`${h.seriesTested} series tested, ${movers.length} moved, ${data.outside.length} outside the change`);
  return `${lines.join('\n')}\n`;
}
