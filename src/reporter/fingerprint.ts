// Code fingerprints: equal fingerprints mean the same game code. Node only (reads the source tree).
// Split from sides.ts so vite.config.ts can compute the multiplayer build fingerprint without
// pulling in the reporter's snapshot helpers.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PURE_DIRS } from '../match/pureDirs.ts';

/**
 * Files outside the pure dirs that the lockstep protocol depends on: peers must run the same
 * versions of them. Mixed into the build fingerprint of the client (`__BHD_FINGERPRINT__`), not into
 * the reporter's.
 */
export const NET_FINGERPRINT_FILES: readonly string[] = [
  'src/net/types.ts',
  'src/net/lockstep.ts',
  'src/net/inputlog.ts',
  'src/net/driver.ts',
];

function sourceFiles(dir: string, prefix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...sourceFiles(join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * SHA-256 over the sorted sources of the pure dirs under `root/src`, plus the `extra` files given
 * relative to `root` (path, then bytes, per file): equal fingerprints mean the same game code.
 */
export function fingerprint(root: string, extra: readonly string[] = []): string {
  const h = createHash('sha256');
  const files = [...PURE_DIRS.flatMap((d) => sourceFiles(join(root, 'src', d), `src/${d}`)), ...extra].sort();
  for (const rel of files) {
    h.update(`${rel}\0`);
    h.update(readFileSync(join(root, rel)));
    h.update('\0');
  }
  return h.digest('hex');
}
