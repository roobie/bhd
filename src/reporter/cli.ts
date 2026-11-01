#!/usr/bin/env node
// `bhd` CLI entry, run by Node directly (type stripping, no build step): `npm run bhd -- <command>`.
// Exit codes: 0 success, 1 failure, 2 usage error.

import process from 'node:process';
import { parseCli, USAGE } from './args.ts';
import type { Deps } from './commands.ts';
import { runCommand } from './commands.ts';
import { DEEP, loadScenario, QUICK } from './scenarios.ts';
import { resolveSide } from './sides.ts';
import type { SideSpec } from './types.ts';

/** The side's command-line form, as `sides.ts` parses it. */
function sideLabel(spec: SideSpec): string {
  switch (spec.kind) {
    case 'worktree':
      return 'WORKTREE';
    case 'ref':
      return spec.ref;
    case 'overrides':
      return spec.path;
    default:
      return `${spec.ref}:${spec.path}`;
  }
}

// `npm run bhd` runs from the package root, which is the repository root.
const REPO = process.cwd();

const DEPS: Deps = {
  resolveSide: (spec, side) => Promise.resolve().then(() => resolveSide(side, sideLabel(spec), REPO, REPO)),
  loadScenario: (deep, file) => {
    if (file !== undefined) {
      return loadScenario(file);
    }
    return deep ? DEEP : QUICK;
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
