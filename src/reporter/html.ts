// The HTML report (step 2c): one self-contained file, inline CSS and SVG, no JS, all text escaped.

import { choiceParts, fmtNum, fmtRel, fmtSigned, halfWidth } from './table.ts';
import type { ChoiceSpreadRow, Divergence, Histogram, ReportData, ReportHeader, SeriesStat } from './types.ts';

const CSS = `
:root{color-scheme:light dark;--bg:#fafaf8;--fg:#1d2127;--mut:#5d6672;--card:#fff;--line:#d8dce1;--a:#4a6f9c;--b:#c8590a;--warn:#9a5b00;--warnbg:#fff4de;--bad:#b3261e;--code:#eef0f3}
@media (prefers-color-scheme:dark){:root{--bg:#14171b;--fg:#e4e7eb;--mut:#9aa4b0;--card:#1c2026;--line:#323941;--a:#7ea6d6;--b:#f0924a;--warn:#f0c36a;--warnbg:#332a14;--bad:#ff8a80;--code:#262b32}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:60rem;margin:0 auto;padding:1rem}
h1{font-size:1.4rem;margin:.5rem 0}
h2{font-size:1.15rem;margin:2rem 0 .5rem;border-bottom:1px solid var(--line);padding-bottom:.25rem}
.meta{color:var(--mut);margin:0}
.meta span{white-space:nowrap;margin-right:1rem}
.warn{background:var(--warnbg);color:var(--warn);border-radius:.4rem;padding:.4rem .7rem;margin:.5rem 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:.5rem;padding:.75rem;margin:.75rem 0;display:flex;flex-wrap:wrap;gap:.75rem 1.5rem}
.card.out{border-left:.3rem solid var(--bad)}
.info{flex:1 1 18rem;min-width:0}
.name{font-weight:600;overflow-wrap:anywhere}
.tag{font-size:.75rem;border:1px solid var(--line);border-radius:1rem;padding:0 .5rem;margin-left:.4rem;color:var(--mut);white-space:nowrap}
.tag.out{color:var(--bad);border-color:var(--bad)}
.num{font-variant-numeric:tabular-nums}
.sub{color:var(--mut);font-size:.9rem}
.cmds{margin:.5rem 0 0}
code{display:block;background:var(--code);border-radius:.3rem;padding:.2rem .5rem;margin:.2rem 0;font:.8rem/1.4 ui-monospace,monospace;overflow-wrap:anywhere;user-select:all}
svg{width:100%;max-width:15rem;height:auto;flex:0 1 15rem}
.ha{fill:var(--a)}.hb{fill:var(--b)}
svg text{fill:var(--mut);font:9px system-ui,sans-serif}
.key{display:inline-block;width:.7rem;height:.7rem;border-radius:.15rem;vertical-align:baseline;margin:0 .2rem 0 .6rem}
.key.a{background:var(--a)}.key.b{background:var(--b)}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.25rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}
.wrap{overflow-x:auto}
details{margin-top:2rem}
summary{cursor:pointer;font-weight:600}
.taxed{color:var(--bad);font-weight:600}
`;

const SHELL_SAFE = /^[\w./:@%+=,-]+$/u;
const HTML_SPECIAL = /[&<>"\x27]/gu;

const ESC: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and attribute values. */
function esc(s: string | number): string {
  return String(s).replace(HTML_SPECIAL, (c) => ESC[c] as string);
}

function shellQuote(s: string): string {
  return SHELL_SAFE.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`;
}

function viewCommand(log: string, tick: number | null): string {
  return `npm run bhd -- view ${shellQuote(log)}${tick === null ? '' : ` --tick ${tick}`}`;
}

// ---------------------------------------------------------------- histogram

const BIN_W = 8;
const BAR_W = 3.4;
const PLOT_H = 44;

function bars(counts: readonly number[], max: number, cls: string, dx: number): string {
  return counts
    .map((c, i) => {
      const h = max === 0 ? 0 : (c / max) * PLOT_H;
      return c === 0
        ? ''
        : `<rect class="${cls}" x="${(i * BIN_W + dx).toFixed(1)}" y="${(PLOT_H - h).toFixed(1)}" width="${BAR_W}" height="${h.toFixed(1)}"/>`;
    })
    .join('');
}

function histogramSvg(h: Histogram, label: string): string {
  const w = h.base.length * BIN_W;
  const max = Math.max(0, ...h.base, ...h.cand);
  return (
    `<svg viewBox="0 0 ${w} ${PLOT_H + 12}" role="img" aria-label="${esc(`Distribution of ${label}, base and candidate`)}">` +
    `<title>${esc(`${label}: ${fmtNum(h.lo)} to ${fmtNum(h.hi)}`)}</title>` +
    bars(h.base, max, 'ha', 0.4) +
    bars(h.cand, max, 'hb', 0.4 + BAR_W) +
    `<line x1="0" x2="${w}" y1="${PLOT_H + 0.5}" y2="${PLOT_H + 0.5}" stroke="currentColor" opacity=".3"/>` +
    `<text x="0" y="${PLOT_H + 10}">${esc(fmtNum(h.lo))}</text>` +
    `<text x="${w}" y="${PLOT_H + 10}" text-anchor="end">${esc(fmtNum(h.hi))}</text></svg>`
  );
}

// ---------------------------------------------------------------- sections

function commands(d: Divergence): string {
  const where =
    d.tick === null
      ? 'The paired logs are identical.'
      : `Largest paired difference: lineup ${d.lineup}, seed ${d.seed}; the games diverge at tick ${d.tick}.`;
  return (
    `<div class="cmds"><div class="sub">${esc(where)}</div>` +
    `<code>${esc(viewCommand(d.baseLog, d.tick))}</code>` +
    `<code>${esc(viewCommand(d.candLog, d.tick))}</code></div>`
  );
}

function badge(s: SeriesStat): string {
  if (s.outside) {
    return '<span class="tag out">outside change</span>';
  }
  return s.inTag ? '<span class="tag">in tag</span>' : '';
}

function card(s: SeriesStat): string {
  const out = badge(s);
  const unit = s.unit === '' ? '' : ` ${esc(s.unit)}`;
  return (
    `<section class="card${s.outside ? ' out' : ''}"><div class="info">` +
    `<div class="name">${esc(s.name)}${out}</div>` +
    `<div class="num">${esc(fmtNum(s.meanBase))} → ${esc(fmtNum(s.meanCand))}${unit}</div>` +
    `<div class="num">Δ ${esc(fmtSigned(s.meanDiff))} ±${esc(fmtNum(halfWidth(s)))} (${esc(fmtRel(s.rel))})</div>` +
    `<div class="sub num">95% CI [${esc(fmtNum(s.ci[0]))}, ${esc(fmtNum(s.ci[1]))}] · effect ${esc(s.effect.toFixed(2))} · n=${esc(s.n)}</div>` +
    (s.divergence === undefined ? '' : commands(s.divergence)) +
    `</div>${histogramSvg(s.histogram, s.name)}</section>`
  );
}

function sideText(s: ReportHeader['base']): string {
  return `${s.label} (${s.ref} @ ${s.sha.slice(0, 8)}${s.dirty ? ', dirty' : ''})`;
}

function header(h: ReportHeader): string {
  const tags = h.tags.length === 0 ? 'none' : h.tags.join(', ');
  return (
    `<h1>${esc(h.scenario)}: ${esc(h.base.label)} → ${esc(h.cand.label)}</h1>` +
    `<p class="meta"><span>base ${esc(sideText(h.base))}</span> <span>cand ${esc(sideText(h.cand))}</span></p>` +
    `<p class="meta"><span>tags: ${esc(tags)}</span><span>${esc(h.pairs)} paired games</span>` +
    `<span>${esc(h.seriesTested)} series tested</span>` +
    `<span>${esc(h.msPerGame.base.toFixed(0))} / ${esc(h.msPerGame.cand.toFixed(0))} ms per game (base / cand)</span>` +
    `<span>distinct games ${esc(h.distinct.base)} / ${esc(h.distinct.cand)}</span></p>` +
    h.warnings.map((w) => `<div class="warn" role="alert">${esc(w)}</div>`).join('') +
    `<p class="sub">Paired by (lineup, seed), Δ = cand − base. Shown: 95% bootstrap CI, ${esc(h.options.resamples)} resamples; ` +
    `hidden when the CI contains 0, |change| &lt; ${esc(fmtRel(h.options.floor).slice(1))}, or it fails Benjamini–Hochberg at q=${esc(h.options.q)}.` +
    `<span class="key a"></span>base<span class="key b"></span>cand</p>`
  );
}

function section(title: string, body: string, empty: string): string {
  return `<h2>${esc(title)}</h2>${body === '' ? `<p class="sub">${esc(empty)}</p>` : body}`;
}

function choiceTable(rows: readonly ChoiceSpreadRow[]): string {
  if (rows.length === 0) {
    return '';
  }
  const body = rows
    .map((r) => {
      const p = choiceParts(r);
      return (
        `<tr><td>${esc(r.hero)} · ${esc(r.decision)}</td><td>${esc(p.names)}</td>` +
        `<td class="num">${esc(p.from)} → ${esc(p.to)}</td>` +
        `<td${r.tax ? ' class="taxed"' : ''}>${r.tax ? 'tax: an option exceeds 90%' : ''}</td></tr>`
      );
    })
    .join('');
  return `<div class="wrap"><table><thead><tr><th>decision</th><th>options</th><th>base → cand (%)</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function unchangedTable(rows: readonly SeriesStat[]): string {
  const body = rows
    .map(
      (s) =>
        `<tr><td>${esc(s.name)}</td><td class="num">${esc(fmtSigned(s.meanDiff))}</td><td class="num">${esc(fmtRel(s.rel))}</td>` +
        `<td class="num">[${esc(fmtNum(s.ci[0]))}, ${esc(fmtNum(s.ci[1]))}]</td></tr>`,
    )
    .join('');
  return `<div class="wrap"><table><thead><tr><th>series</th><th>Δ</th><th>change</th><th>95% CI</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderHtml(data: ReportData): string {
  const h = data.header;
  const movers = data.series.filter((s) => s.significant);
  const inside = movers.filter((s) => !s.outside);
  const outside = movers.filter((s) => s.outside);
  const rest = data.series.filter((s) => !s.significant);
  const tagged = h.tags.length > 0;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(`BHD report: ${h.scenario}`)}</title><style>${CSS}</style></head><body><main>` +
    header(h) +
    section(
      tagged ? 'Movers inside the change' : 'Movers',
      inside.map(card).join(''),
      'Nothing moved beyond the noise floor.',
    ) +
    (tagged
      ? section('Flagged: movers outside the change', outside.map(card).join(''), 'Nothing moved outside the change.')
      : '') +
    section('Choice spread', choiceTable(data.choiceSpread), 'No choice data.') +
    `<details><summary>${esc(rest.length)} unchanged series (inside the noise floor)</summary>${unchangedTable(rest)}</details>` +
    '</main></body></html>\n'
  );
}
