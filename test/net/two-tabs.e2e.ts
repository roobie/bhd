// Two pages play one co-op game over real WebRTC (BroadcastChannel signalling, `room=local-*`).
// Not part of CI: run it by hand (it starts `vite` itself and kills it by pid):
//
//   node test/net/two-tabs.e2e.ts [chromium|firefox] [screenshotDir]
//
// Steps: create (page A), join (page B), pick slots, start, step ~600 ticks, pause and resume from
// the joiner, compare the two hash sequences, restart back to the lobby, play again, close the
// joiner and check the host's bot takes the hero. Exits non-zero on the first failed check.

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { type BrowserType, chromium, firefox, type Page } from 'playwright';

const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TARGET_TICKS = 600;

/** What play.html exposes on `window.__bhdCoop` (coop.ts `onGame`). */
interface Hook {
  readonly shell: {
    match: () => { tick: number; driven: readonly number[] };
    dispatch: (action: { kind: string }) => void;
  };
  readonly driver: {
    status: () => string;
    log: () => {
      hashes: { tick: number; hash: string }[];
      seals: { tick: number; inputs: { player: number; cmd: { kind: string } }[] }[];
    };
  };
}

const browserName = process.argv[2] === 'firefox' ? 'firefox' : 'chromium';
const shotDir = process.argv[3] ?? '/tmp/w10-int';

function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    throw new Error(`check failed: ${what}`);
  }
}

function startVite(): Promise<ChildProcess> {
  const child = spawn(
    process.env.VITE_BIN ?? 'node_modules/.bin/vite',
    ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes(String(PORT))) {
        resolve(child);
      }
    });
    child.once('exit', (code) => reject(new Error(`vite exited with ${code}`)));
  });
}

const hook = (page: Page): Promise<{ tick: number; status: string; driven: readonly number[] } | undefined> =>
  page.evaluate(() => {
    const h = (globalThis as unknown as { __bhdCoop?: Hook }).__bhdCoop;
    return h === undefined
      ? undefined
      : { tick: h.shell.match().tick, status: h.driver.status(), driven: [...h.shell.match().driven] };
  });

async function waitFor(what: string, fn: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const tickOf = async (page: Page): Promise<number> => (await hook(page))?.tick ?? -1;

function hashesOf(page: Page): Promise<{ tick: number; hash: string }[]> {
  return page.evaluate(() => (globalThis as unknown as { __bhdCoop: Hook }).__bhdCoop.driver.log().hashes);
}

async function main(): Promise<void> {
  mkdirSync(shotDir, { recursive: true });
  const vite = await startVite();
  const type: BrowserType = browserName === 'firefox' ? firefox : chromium;
  const browser = await type.launch({
    args: browserName === 'chromium' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
  });
  try {
    const room = `local-${Math.random().toString(36).slice(2, 8)}`;
    // Pages of one browser context share BroadcastChannel; each page needs its own context for storage but not for this.
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    const open = async (name: string): Promise<Page> => {
      const page = await context.newPage();
      page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.message}`));
      page.on(
        'console',
        (m) =>
          (m.type() === 'error' || m.type() === 'warning') &&
          !m.text().includes('Lit') &&
          console.log(`[${name}] ${m.type()}: ${m.text()}`),
      );
      await page.goto(`${ORIGIN}/play.html#room=${room}&name=${name}`);
      return page;
    };
    const a = await open('Ada');
    await a.waitForSelector('.lobby [data-act="start"]');
    const b = await open('Bob');
    await b.waitForSelector('.lobby .lslot');
    check((await a.locator('.lcode').textContent()) === room, 'host lobby shows the room code');

    await a.click('[data-slot="0"] [data-act="pick"]');
    await waitFor('B sees A in slot 0', async () =>
      ((await b.textContent('[data-slot="0"] .lwho')) ?? '').includes('Ada'),
    );
    await b.click('[data-slot="1"] [data-act="pick"]');
    await waitFor('A sees B in slot 1', async () =>
      ((await a.textContent('[data-slot="1"] .lwho')) ?? '').includes('Bob'),
    );
    check(true, 'both players hold a slot and see each other by name');
    await a.screenshot({ path: join(shotDir, `lobby-host-${browserName}.png`) });
    await b.screenshot({ path: join(shotDir, `lobby-joiner-${browserName}.png`) });

    await a.click('[data-act="start"]');
    await waitFor('both games up', async () => (await hook(a)) !== undefined && (await hook(b)) !== undefined);
    check(true, 'start: both peers run a game');
    await waitFor(
      `${TARGET_TICKS} ticks`,
      async () => (await tickOf(a)) >= TARGET_TICKS && (await tickOf(b)) >= TARGET_TICKS - 30,
    );
    await a.screenshot({ path: join(shotDir, `game-host-${browserName}.png`) });
    await b.screenshot({ path: join(shotDir, `game-joiner-${browserName}.png`) });

    // Pause from the joiner, then resume from the joiner.
    await b.evaluate(() => (globalThis as unknown as { __bhdCoop: Hook }).__bhdCoop.shell.dispatch({ kind: 'pause' }));
    await waitFor(
      'both paused',
      async () => (await hook(a))?.status === 'paused' && (await hook(b))?.status === 'paused',
    );
    const frozen = [await tickOf(a), await tickOf(b)];
    await new Promise((r) => setTimeout(r, 800));
    check(frozen[0] === (await tickOf(a)) && frozen[1] === (await tickOf(b)), 'paused: neither peer advances');
    check(
      Math.abs((frozen[0] ?? 0) - (frozen[1] ?? 0)) <= 3,
      `paused within the input delay of each other (${frozen[0]} / ${frozen[1]})`,
    );
    await b.screenshot({ path: join(shotDir, `paused-joiner-${browserName}.png`) });
    // The host takes at most one pause or resume per peer per second (L5): let the gap pass.
    await new Promise((r) => setTimeout(r, 1200));
    await b.evaluate(() => (globalThis as unknown as { __bhdCoop: Hook }).__bhdCoop.shell.dispatch({ kind: 'pause' }));
    await waitFor(
      'both running again',
      async () => (await tickOf(a)) > (frozen[0] ?? 0) + 30 && (await tickOf(b)) > (frozen[1] ?? 0) + 30,
    );
    check(true, 'resumed from the joiner: both advance again');

    const [ha, hb] = [await hashesOf(a), await hashesOf(b)];
    const common = Math.min(ha.length, hb.length);
    check(common >= 15, `hash checkpoints compared: ${common}`);
    check(
      JSON.stringify(ha.slice(0, common)) === JSON.stringify(hb.slice(0, common)),
      'hash sequences are identical on both peers',
    );
    check((await hook(a))?.status !== 'desynced' && (await hook(b))?.status !== 'desynced', 'no desync reported');

    // Restart returns both to a fresh lobby.
    await a.evaluate(() =>
      (globalThis as unknown as { __bhdCoop: Hook }).__bhdCoop.shell.dispatch({ kind: 'restart' }),
    );
    await waitFor(
      'both back in the lobby',
      async () => (await a.isVisible('.lobby [data-act="start"]')) && (await b.isVisible('.lobby .lslot')),
    );
    check(true, 'restart: both peers are back in a fresh lobby');
    await waitFor(
      'lobby re-formed',
      async () => ((await b.textContent('[data-slot="0"] .lwho')) ?? '').includes('Ada') === false,
    );
    await a.click('[data-slot="0"] [data-act="pick"]');
    await b.click('[data-slot="1"] [data-act="pick"]');
    await waitFor('A sees B again', async () => ((await a.textContent('[data-slot="1"] .lwho')) ?? '').includes('Bob'));
    await a.screenshot({ path: join(shotDir, `lobby-again-${browserName}.png`) });
    await a.click('[data-act="start"]');
    await waitFor('second game', async () => (await tickOf(a)) > 90 && (await tickOf(b)) > 60);
    check(true, 'a second game starts from the re-formed lobby');

    // Closing the joiner: the host's bot takes its hero.
    await b.close();
    await waitFor('host hands slot 1 to a bot', async () => !((await hook(a))?.driven ?? [0, 1]).includes(1));
    const t0 = await tickOf(a);
    await waitFor('host keeps playing', async () => (await tickOf(a)) > t0 + 60);
    const seals = await a.evaluate(() => (globalThis as unknown as { __bhdCoop: Hook }).__bhdCoop.driver.log().seals);
    check(
      seals.some((s) => s.inputs.some((i) => i.cmd.kind === 'control')),
      'a sealed control command handed the dropped hero to a bot',
    );
    await a.screenshot({ path: join(shotDir, `host-after-drop-${browserName}.png`) });
    console.log('PASS');
  } finally {
    await browser.close();
    vite.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 2000).unref();
});
