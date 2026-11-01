// Browser entry. Placeholder shell until the client waves (DESIGN.md §7, wave 7).

import { html, render } from 'lit-html';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  render(html`<h1>BHD</h1><p>Bjorn's Hero Defense: nothing playable yet.</p>`, app);
}
