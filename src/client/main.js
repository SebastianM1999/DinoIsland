// Entry point: menu / lobby flow and game start.

import { Game } from './core/game.js';
import { Net } from './net/net.js';
import { CONFIG } from '../shared/config.js';
import { ICON_SPRITE, initSettings, renderPause } from './ui/menus.js';
import { savedOutfit } from './ui/wardrobe.js';
import { preloadDinoModels } from './models/dino/glbDino.js';
import { GameAudio } from './audio/audio.js';
import { initSteamLobby } from './ui/steamLobby.js';
import { initLanAddress, websocketAddress } from './net/lan.js';
import { initInternetTest } from './ui/internetTest.js';
import { BRAND, storageKey, migrateStorage } from '../shared/brand.js';

migrateStorage();
// Testing aids (solo only): ?island=2 starts on island 2 (1-based), ?base=1..3
// with the team's base already standing on the first building plot.
const DEBUG_QUERY = new URLSearchParams(location.search);
const DEBUG_ISLAND = Math.max(0, (Number(DEBUG_QUERY.get('island')) || 1) - 1);
const DEBUG_BASE = Math.max(0, Math.min(3, Number(DEBUG_QUERY.get('base')) || 0));
document.title = BRAND.name;

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
const loadingText = loading.querySelector('.loading-text');
const canvas = $('game');
const status = $('lobby-status');
const nameInput = $('player-name');
const serverInput = $('server-url');
const buttons = [$('btn-join'), $('btn-solo'), $('btn-host'), $('btn-host-lan'), $('btn-friends'), $('btn-host-internet'), $('btn-join-internet')];
const internetTest = initInternetTest();
let busy = false;

let game = null;
let menuAudio = null;
// Browsers unlock audio on a user gesture. Reuse this context in the game.
function playMenuMusic() {
  if (menu.hidden || !loading.hidden) return;
  menuAudio ??= new GameAudio();
  menuAudio.resume();
  if (!menuAudio.islandMusic?.active) menuAudio.startMenuMusic();
}
document.addEventListener('pointerdown', playMenuMusic, { capture: true });
document.addEventListener('keydown', playMenuMusic, { capture: true });
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
  $('btn-friends').disabled = busy || !steamLobby.available;
  status.textContent = text;
  if (text) delete status.dataset.auto;
}

async function start(mode, options = {}) {
  if (busy || game?.running) return;
  busy = true;
  playMenuMusic();
  const name = nameInput.value.trim() || 'Explorer';
  try { localStorage.setItem(storageKey('name'), name); } catch { /* storage may be blocked */ }
  setBusy(true, mode === 'online' ? 'Connecting…' : 'Starting…');
  let net;
  try {
    const outfit = savedOutfit();
    if (mode === 'internet') options.url = await internetTest.start();
    net = mode === 'steam' ? await Net.steam(window.dinoSteam, options, name, outfit) :
      mode === 'online' || mode === 'internet' ? await Net.connect(websocketAddress(options.url ?? serverInput.value), name, outfit) : await Net.local(name, outfit, { level: DEBUG_ISLAND, baseStage: DEBUG_BASE });
  } catch (err) {
    if (mode === 'internet') internetTest.stop();
    busy = false;
    setBusy(false, err.message || String(err));
    return;
  }
  menu.hidden = true;
  steamLobby.updateSession(net.steamSession);
  menuAudio?.stopMusic();
  if (await launch(net)) setBusy(false, '');
  busy = false;
}

/**
 * Build and start a Game for the island in net.welcome. `reuse` hands over the
 * renderer, audio and input of the previous island's game.
 */
async function launch(net, reuse = null) {
  let disconnectReason = 'Disconnected while loading the island';
  net.onClose = reason => { disconnectReason = reason || disconnectReason; };
  const lv = net.welcome.world.level;
  loadingText.textContent = reuse ? `Sailing to island ${lv.index + 1}…` : 'Building the island…';
  loading.hidden = false;
  // Let the loading screen paint before the heavy world build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  try {
    await preloadDinoModels((done, total) => {
      loadingText.textContent = `Loading dinosaurs… ${done}/${total}`;
    });
    if (net.closed) throw new Error(disconnectReason);
    loadingText.textContent = 'Building the island…';
    game = new Game(canvas, net, reuse ?? (menuAudio ? { audio: menuAudio } : null));
    if (DEBUG_QUERY.has('debug')) window.dinoGame = game;   // testing aid: inspect the running game
  } catch (err) {
    console.error(err);
    net.close();
    internetTest.stop();
    loading.hidden = true;
    menu.hidden = false;
    menuAudio?.startMenuMusic();
    setBusy(false, `Could not start the game: ${err.message}`);
    return false;
  }
  window.__game = game; // handy for debugging in the console
  game.input.onLockChange = (locked) => {
    setPaused(!locked && game?.running && !game.hud.isPanelOpen() && !game.input.lockPending);
  };
  game.onPanelChange = () => setPaused(false);
  game.onLeave = (reason) => backToMenu(reason);
  // The team set sail: the server sends a fresh welcome for the next island.
  game.onNewIsland = (welcome) => {
    const shared = game.dispose();
    net.welcome = welcome;
    launch(net, shared);
  };
  loading.hidden = true;
  game.start();
  game.input.requestLock();
  setPaused(!game.input.locked);
  return true;
}

function backToMenu(reason) {
  internetTest.stop();
  game?.audio.stopMusic();
  // Simplest robust teardown: reload with the reason in the hash.
  location.hash = reason ? `msg=${encodeURIComponent(reason)}` : '';
  location.reload();
}

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (document.activeElement === $('friend-internet-address')) start('online', { url: $('friend-internet-address').value });
  else start('online');
});
$('btn-solo').addEventListener('click', () => start('local'));
$('btn-host-internet').addEventListener('click', () => start('internet', { url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` }));
$('btn-join-internet').addEventListener('click', () => start('online', { url: $('friend-internet-address').value }));
$('btn-host-lan').addEventListener('click', () => start('online', { url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` }));
$('btn-host').addEventListener('click', async () => {
  await steamLobby.ready;
  if (steamLobby.available) void start('steam', { host: true, visibility: $('lobby-visibility').value });
  else void start('online', { url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` });
});
const steamLobby = initSteamLobby({
  join: lobbyId => start('steam', { lobbyId }),
  isPlaying: () => busy || !!game?.running,
  leaveToJoin: () => { game?.net.close(); backToMenu(''); },
  notifyInvite: () => game?.hud.toast('Steam invite received. Open the pause menu to join your friend.'),
  releasePointer: () => { game?.input.exitLock(); if (game?.running) setPaused(true); },
});
function resumeGame() {
  if (!game?.running) return;
  setPaused(false);
  game.audio.resume();
  game.input.requestLock();
}
$('btn-resume').addEventListener('click', resumeGame);
$('btn-pause-close').addEventListener('click', resumeGame);
paused.addEventListener('click', (e) => {
  if (e.target === paused) resumeGame();
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

try { nameInput.value = localStorage.getItem(storageKey('name')) || ''; } catch { /* ignore */ }
serverInput.value = served ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : `ws://localhost:${CONFIG.net.port}`;
const hashMsg = new URLSearchParams(location.hash.slice(1)).get('msg');
if (hashMsg) {
  status.textContent = hashMsg;
  history.replaceState(null, '', location.pathname);
}

// Lobby: show who is already on the server.
async function pollLobby() {
  if (!menu.hidden && served && !busy && !steamLobby.available) {
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
      status.textContent = 'No co-op server found – you can still play solo.';
    }
  }
  setTimeout(pollLobby, 2000);
}
pollLobby();
void initLanAddress();
