import './style.css';
import { Game } from './game.js';

const game = new Game();
window.__game = game;
game.boot().catch((e) => {
  console.error(e);
  document.getElementById('loadTxt').textContent = 'Failed to start: ' + e.message;
});
