// The HTML report (step 2c): one self-contained file, inline CSS and SVG, no JS, all text escaped.

import type { ReportData } from './types.ts';

export function renderHtml(_data: ReportData): string {
  throw new Error('renderHtml: not implemented');
}
