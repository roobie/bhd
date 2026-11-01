// `bhd` CLI entry, run by Node directly (type stripping, no build step).
// Placeholder until the reporter wave (DESIGN.md §6.5, wave 5).

import process from 'node:process';

const USAGE = 'usage: bhd report --base <ref|config> --cand <ref|config> [--tag <area>] [--games <n>]';

const [command] = process.argv.slice(2);
if (command === undefined || command === 'help' || command === '--help') {
  console.log(USAGE);
} else {
  console.error(`bhd: '${command}' is not implemented yet\n${USAGE}`);
  process.exitCode = 1;
}
