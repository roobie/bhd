#!/usr/bin/env node
// `bhd` CLI entry, run by Node directly (type stripping, no build step): `npm run bhd -- <command>`.
// Exit codes: 0 success, 1 failure, 2 usage error.

import process from 'node:process';
import { parseCli, USAGE } from './args.ts';
import type { Deps } from './commands.ts';
import { runCommand } from './commands.ts';

// Side resolution and the built-in scenarios are the runner slice's (sides.ts, scenarios.ts);
// until the lead wires them in, report and run stop here.
const DEPS: Deps = {
  resolveSide: () => Promise.reject(new Error('resolveSide: not implemented (runner slice)')),
  loadScenario: () => {
    throw new Error('loadScenario: not implemented (runner slice)');
  },
};

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseCli(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    return 2;
  }
  if (parsed.command.cmd === 'help') {
    console.log(USAGE);
    return 0;
  }
  try {
    await runCommand(parsed.command, DEPS, {
      out: (text) => console.log(text),
      err: (text) => process.stderr.write(text),
    });
    return 0;
  } catch (error) {
    console.error(`bhd: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
