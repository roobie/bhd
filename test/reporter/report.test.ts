// The renderers on synthetic data: CLI table format, HTML escaping and shape, stable report.json.
// No gameplay assertions.

import { describe, expect, it } from 'vitest';
import { renderHtml } from '../../src/reporter/html.ts';
import { buildReport, reportJson } from '../../src/reporter/stats.ts';
import { renderTable } from '../../src/reporter/table.ts';
import type { ReportData } from '../../src/reporter/types.ts';
import { logOf, makeInput, metric, normals } from './synth.ts';

const WAVE_LINE = /^Δ outcome\.wave\s+\+2\.00 ±/u;
const SCRIPT_TAG = /<script/iu;
const LINK_ATTR = /(?:src|href)\s*=/iu;
const EVIL = `<script>alert("x")</script> & 'q'`;

function sample(tags: string[], evil = false): ReportData {
  const noise = normals(3);
  const input = makeInput({
    pairs: 60,
    tags,
    metrics: [
      metric('outcome.wave', ['outcome']),
      metric(evil ? EVIL : 'team.ff', ['team.ff']),
      metric('choice.spread', ['gunner.choice']),
    ],
    series: {
      'outcome.wave': () => {
        const a = 10 + noise();
        return [a, a + 2];
      },
      [evil ? `${EVIL}[x]` : 'team.ff[a>b]']: () => {
        const a = 5 + noise();
        return [a, a * 1.5];
      },
      'choice.spread[gunner:stance:brace]': () => [0.71, 0.78],
      'choice.spread[gunner:stance:mobile]': () => [0.29, 0.22],
    },
    loadLog: () => logOf([]),
  });
  const data = buildReport(input);
  if (!evil) {
    return data;
  }
  const first = data.series.map((s) =>
    s.divergence === undefined ? s : { ...s, divergence: { ...s.divergence, baseLog: `it's "<b>".gz`, tick: 77 } },
  );
  return { ...data, series: first, header: { ...data.header, base: { ...data.header.base, label: EVIL } } };
}

describe('renderTable', () => {
  const text = renderTable(sample(['outcome']));

  it('prints movers with a ± CI, marks the ones outside the change, and ends with counts', () => {
    const lines = text.split('\n');
    const wave = lines.find((l) => l.includes('outcome.wave'));
    const ff = lines.find((l) => l.includes('team.ff'));
    expect(wave).toMatch(WAVE_LINE);
    expect(wave).not.toContain('outside change');
    expect(ff).toContain('← outside change');
    expect(text).toContain('series tested');
  });

  it('prints choice lines as shares of each option, base → cand', () => {
    expect(text).toContain('brace vs mobile  71/29 → 78/22');
  });

  it('ends with a newline and is stable', () => {
    expect(text.endsWith('\n')).toBe(true);
    expect(renderTable(sample(['outcome']))).toBe(text);
  });
});

describe('renderHtml', () => {
  const html = renderHtml(sample(['outcome']));

  it('is one self-contained file: inline CSS and SVG, no scripts, no external references', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('<svg');
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(SCRIPT_TAG);
    expect(html).not.toMatch(LINK_ATTR);
    expect(html).not.toContain('http');
  });

  it('has the sections, the outside flag and the choice table', () => {
    expect(html).toContain('Movers inside the change');
    expect(html).toContain('Flagged: movers outside the change');
    expect(html).toContain('outside change</span>');
    expect(html).toContain('Choice spread');
    expect(html).toContain('71/29 → 78/22');
    expect(html).toContain('<details>');
  });

  it('omits the outside section when no tags were given', () => {
    expect(renderHtml(sample([]))).not.toContain('Flagged: movers outside');
  });

  it('escapes every string, including attributes and commands', () => {
    const bad = renderHtml(sample(['outcome'], true));
    expect(bad).not.toContain('<script>');
    expect(bad).not.toContain('<b>');
    expect(bad).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;');
    expect(bad).toContain('npm run bhd -- view');
    expect(bad).toContain('--tick 77');
    expect(bad).toContain('&lt;b&gt;');
  });

  it('is deterministic', () => {
    expect(renderHtml(sample(['outcome']))).toBe(html);
  });
});

describe('report.json', () => {
  it('has stable bytes for a fixed input and parses back to the same data', () => {
    const a = reportJson(sample(['outcome']));
    expect(reportJson(sample(['outcome']))).toBe(a);
    expect(JSON.parse(a)).toEqual(JSON.parse(JSON.stringify(sample(['outcome']))));
    expect(a.endsWith('\n')).toBe(true);
  });
});
