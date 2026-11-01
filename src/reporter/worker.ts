// Pool worker (step 2a): runs one game per `run` message and replies `done` or `error`.

import { parentPort } from 'node:worker_threads';
import type { PoolMsg } from './types.ts';

parentPort?.on('message', (msg: PoolMsg) => {
  if (msg.type === 'run') {
    const reply: PoolMsg = { type: 'error', id: msg.id, message: 'worker: not implemented' };
    parentPort?.postMessage(reply);
  }
});
