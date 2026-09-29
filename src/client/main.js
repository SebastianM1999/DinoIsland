// Entry point: menu / lobby flow and game start.

import { Game } from './core/game.js';
import { Net } from './net/net.js';
import { CONFIG } from '../shared/config.js';
import { ICON_SPRITE, initSettings, renderPause } from './ui/menus.js';
import { savedOutfit } from './ui/wardrobe.js';

// SVG filter that gives HUD and menu panels their brush-stroke edges.
document.body.insertAdjacentHTML('beforeend', `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <filter id="brush-edge" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="4" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>${ICON_SPRITE}`);

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const paused = $('paused');
const loading = $('loading');
const canvas = $('game');
const status = $('lobby-status');
const nameInput = $('player-name');
const serverInput = $('server-url');
const buttons = [$('btn-join'), $('btn-solo')];

let game = null;
const settingsUi = initSettings();

/** Show or hide the pause card; refresh its expedition/team info when shown. */
function setPaused(show) {
  if (show && paused.hidden) {
    renderPause(game);
    resetLeave();
    syncCreative();
  }
  paused.hidden = !show;
  if (!show) settingsUi.close();
}
const served = location.protocol.startsWith('http');

function setBusy(busy, text = '') {
  for (const b of buttons) b.disabled = busy;
  status.textContent = text;
  if (text) delete status.dataset.auto;
}

async function start(mode) {
  const name = nameInput.value.trim() || 'Explorer';
  try { localStorage.setItem('di.name', name); } catch { /* storage may be blocked */ }
  setBusy(true, mode === 'online' ? 'Connecting…' : 'Starting…');
  let net;
  try {
    const outfit = savedOutfit();
    net = mode === 'online' ? await Net.connect(serverInput.value.trim(), name, outfit) : await Net.local(name, outfit);
  } catch (err) {
    setBusy(false, err.message || String(err));
    return;
  }
  menu.hidden = true;
  loading.hidden = false;
  // Let the loading screen paint before the heavy world build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  try {
    game = new Game(canvas, net);
  } catch (err) {
    console.error(err);
    net.close();
    loading.hidden = true;
    menu.hidden = false;
    setBusy(false, `Could not start the game: ${err.message}`);
    return;
  }
  window.__game = game; // handy for debugging in the console
  game.input.onLockChange = (locked) => {
    setPaused(!locked && game?.running && !game.hud.isPanelOpen());
  };
  game.onPanelChange = (open) => setPaused(!open && !game.input.locked);
  game.onLeave = (reason) => backToMenu(reason);
  loading.hidden = true;
  game.start();
  game.input.requestLock();
  setPaused(!game.input.locked);
  setBusy(false, '');
}

function backToMenu(reason) {
  // Simplest robust teardown: reload with the reason in the hash.
  location.hash = reason ? `msg=${encodeURIComponent(reason)}` : '';
  location.reload();
}

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  start('online');
});
$('btn-solo').addEventListener('click', () => start('local'));
$('btn-resume').addEventListener('click', () => game?.input.requestLock());
paused.addEventListener('click', (e) => {
  if (e.target === paused) game?.input.requestLock();
});
canvas.addEventListener('click', () => {
  if (!game?.running || game.hud.isPanelOpen()) return;
  game.audio.resume();
  game.input.requestLock();
});
// Leaving needs a second click so a stray click can't end the expedition.
const leaveBtn = $('btn-leave');
let leaveTimer = 0;
function resetLeave() {
  clearTimeout(leaveTimer);
  delete leaveBtn.dataset.confirm;
  leaveBtn.lastElementChild.textContent = 'Leave game';
}
// Creative mode toggle (invincible + flying); the label shows the current state.
const creativeBtn = $('btn-creative');
function syncCreative() {
  const on = !!game?.player.creative;
  creativeBtn.setAttribute('aria-pressed', String(on));
  creativeBtn.lastElementChild.textContent = `Creative mode: ${on ? 'On' : 'Off'}`;
}
creativeBtn.addEventListener('click', () => {
  if (!game) return;
  game.setCreative(!game.player.creative);
  syncCreative();
});
leaveBtn.addEventListener('click', () => {
  if (!leaveBtn.dataset.confirm) {
    leaveBtn.dataset.confirm = '1';
    leaveBtn.lastElementChild.textContent = 'Click again to leave';
    leaveTimer = setTimeout(resetLeave, 3000);
    return;
  }
  game?.net.close();
  backToMenu('');
});

try { nameInput.value = localStorage.getItem('di.name') || ''; } catch { /* ignore */ }
serverInput.value = served ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : `ws://localhost:${CONFIG.net.port}`;
const hashMsg = new URLSearchParams(location.hash.slice(1)).get('msg');
if (hashMsg) {
  status.textContent = hashMsg;
  history.replaceState(null, '', location.pathname);
}

// Lobby: show who is already on the server.
async function pollLobby() {
  if (!menu.hidden && served) {
    try {
      const res = await fetch('/status', { cache: 'no-store' });
      const s = await res.json();
      const list = $('lobby-players');
      list.replaceChildren(...s.players.map((p) => {
        const li = document.createElement('li');
        li.textContent = p.name;
        li.style.setProperty('--c', CONFIG.playerColors[p.slot % 4]);
        return li;
      }));
      if (!status.textContent || status.dataset.auto) {
        status.dataset.auto = '1';
        status.textContent = s.players.length
          ? `${s.players.length}/${s.maxPlayers} explorers on this server`
          : 'The server is empty – start the expedition!';
        if (s.players.length >= s.maxPlayers) status.textContent = 'The server is full (4/4).';
      }
    } catch {
      $('btn-join').disabled = true;
      status.textContent = 'No co-op server found – you can still play solo.';
    }
  }
  setTimeout(pollLobby, 2000);
}
pollLobby();
