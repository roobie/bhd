import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// DESIGN.md §6: the folder layout other slices own pieces of.
const FOLDERS = [
  'src/sim',
  'src/detmath',
  'src/content',
  'src/perception',
  'src/bots',
  'src/intents',
  'src/director',
  'src/reporter',
  'src/replay',
  'src/client',
  'src/net',
  'worker',
  'docs',
];

describe('repo layout', () => {
  it.each(FOLDERS)('%s exists', (folder) => {
    expect(existsSync(folder) && statSync(folder).isDirectory()).toBe(true);
  });
});
