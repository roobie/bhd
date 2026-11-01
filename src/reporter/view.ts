// `bhd view <log> [--tick T]` (step 2e): serves the viewer on the log's own code, paused at T.
// The log's code is the repo for a WORKTREE log, else the snapshot `.bhd/snap/<sha>` the runner made
// of that commit (its `node_modules` resolve from the repo root, which the snapshot sits under).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { Plugin, ViteDevServer } from 'vite';
import { createServer } from 'vite';
import { decodeLog } from '../replay/log.ts';
import type { ViewOptions } from './types.ts';

/** Where the viewer fetches the decompressed log from. */
const LOG_ROUTE = '/__bhd/log';
const GZIP_MAGIC = [0x1f, 0x8b];
const WORKTREE_REF = 'WORKTREE';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The log as NDJSON text, gunzipped when it is gzip (by magic bytes, not by name). */
function readLogText(path: string): string {
  const raw = readFileSync(path);
  const zipped = raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1];
  return (zipped ? gunzipSync(raw) : raw).toString('utf8');
}

/** The directory with the code that played the logged game; throws when it is not on disk. */
function codeRootOf(ref: string, sha: string, repoRoot: string = REPO_ROOT): string {
  if (ref === WORKTREE_REF) {
    return repoRoot;
  }
  const snap = join(repoRoot, '.bhd', 'snap', sha);
  if (!(existsSync(join(snap, 'index.html')) && existsSync(join(snap, 'src')))) {
    throw new Error(`no snapshot of ${ref} (${sha}) at ${snap}; run a batch with that ref first`);
  }
  return snap;
}

/** The hash-fragment link the viewer opens: `#log=/__bhd/log&tick=T`. */
function viewHash(tick: number | undefined): string {
  return `#log=${LOG_ROUTE}${tick === undefined ? '' : `&tick=${tick}`}`;
}

function logPlugin(text: string): Plugin {
  return {
    name: 'bhd-log',
    configureServer(server) {
      server.middlewares.use(LOG_ROUTE, (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(text);
      });
    },
  };
}

/** The command that opens a URL on this platform. */
function opener(url: string): { readonly cmd: string; readonly args: string[] } {
  switch (process.platform) {
    case 'darwin':
      return { cmd: 'open', args: [url] };
    case 'win32':
      return { cmd: 'cmd', args: ['/c', 'start', '', url] };
    default:
      return { cmd: 'xdg-open', args: [url] };
  }
}

function openBrowser(url: string): void {
  const { cmd, args } = opener(url);
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // No opener on this machine: the URL is printed anyway.
  });
  child.unref();
}

function waitForSignal(server: ViteDevServer): Promise<void> {
  return new Promise((done) => {
    const stop = (): void => {
      server.close().then(done, done);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

/** Starts the dev server and runs until SIGINT / SIGTERM. */
export async function runView(options: ViewOptions): Promise<void> {
  const text = readLogText(options.logPath);
  const { header } = decodeLog(text);
  const root = codeRootOf(header.ref, header.sha);
  const server = await createServer({
    root,
    configFile: false,
    base: './',
    logLevel: 'warn',
    worker: { format: 'es' },
    server: { open: false, ...(options.port === undefined ? {} : { port: options.port }) },
    plugins: [logPlugin(text)],
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`;
  const url = `${base}${viewHash(options.tick)}`;
  console.log(
    `bhd view: ${header.side} ${header.ref} ${header.sha.slice(0, 7)}${header.dirty ? '+dirty' : ''}, code at ${root}`,
  );
  console.log(`bhd view: ${url}`);
  if (options.open !== false) {
    openBrowser(url);
  }
  await waitForSignal(server);
}
