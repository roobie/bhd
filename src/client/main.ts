// Browser entry: the wave-0..6 debug viewer (see app.ts). The real client arrives in wave 7.

import { mount } from './app.ts';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  mount(app);
}
