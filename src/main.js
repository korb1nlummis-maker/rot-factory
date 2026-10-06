import './style.css';
import { Game } from './game.js';

const game = new Game();
window.__game = game;
game.boot().catch((e) => {
  console.error(e);
  document.getElementById('loadTxt').textContent = 'Failed to start: ' + e.message;
});

// dev server only: `await __selftest()` or `await __selftest('hands.')` runs the in-game self test (src/selftest.js)
if (import.meta.env && import.meta.env.DEV) {
  import('./selftest.js').then((m) => {
    window.__selftest = async (only = '') => {
      const r = await m.runSelfTest(game, only);
      const failed = r.results.filter((x) => !x.ok);
      return { total: r.results.length, passed: r.results.length - failed.length, failed, frameErrors: r.errs };
    };
    window.__stHelpers = async () => (await m.runSelfTest(game, '__none__')).helpers;
  });
}
