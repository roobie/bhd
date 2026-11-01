// Browser entry of play.html. Owner: w7-shell.

import { mountShell } from './app.ts';
import { parseShellHash } from './config.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const hud = document.querySelector<HTMLElement>('#hud');
if (canvas && hud) {
  mountShell({ canvas, hud }, parseShellHash(globalThis.location.hash));
}
