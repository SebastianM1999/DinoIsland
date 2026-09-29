// Entry point: menu / lobby flow and game start.

import { Game } from './core/game.js';

// SVG filter that gives HUD and menu panels their brush-stroke edges.
document.body.insertAdjacentHTML('beforeend', `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <filter id="brush-edge" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="4" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`);

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const paused = $('paused');
const canvas = $('game');

let game = null;

function startGame() {
  menu.hidden = true;
  if (!game) {
    game = new Game(canvas);
    game.input.onLockChange = (locked) => {
      paused.hidden = locked;
    };
    game.start();
    window.__game = game; // handy for debugging in the console
  }
  game.input.requestLock();
}

$('btn-solo').addEventListener('click', startGame);
$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  startGame();
});
$('btn-resume').addEventListener('click', () => game?.input.requestLock());
paused.addEventListener('click', (e) => {
  if (e.target === paused) game?.input.requestLock();
});
canvas.addEventListener('click', () => game?.input.requestLock());
$('btn-leave').addEventListener('click', () => location.reload());

$('player-name').value = localStorage.getItem('di.name') || '';
$('server-url').value = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host || 'localhost:8080'}`;
