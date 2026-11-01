// `bhd view <log> [--tick T]` (step 2e): serves the viewer on the log's own code, paused at T.

import type { ViewOptions } from './types.ts';

export function runView(_options: ViewOptions): Promise<void> {
  return Promise.reject(new Error('runView: not implemented'));
}
