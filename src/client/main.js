// Entry point: menu / lobby flow and game start.

import { Net } from './net/net.js';
import { CONFIG } from '../shared/config.js';
import { ICON_SPRITE, initSettings, renderPause } from './ui/menus.js';
import { savedOutfit } from './ui/wardrobe.js';
import { loadProfile } from './core/profile.js';
import { unlockIsland, unlockedStartingIsland, availableStartingIsland } from './core/islandProgress.js';
import { EV } from '../shared/protocol.js';
import { preloadDinoModels } from './models/dino/glbDino.js';
import { GameAudio } from './audio/audio.js';
import { initSteamLobby } from './ui/steamLobby.js';
import { initLanAddress, websocketAddress } from './net/lan.js';
import { initInternetTest } from './ui/internetTest.js';
import { initHomeMenu } from './ui/homeMenu.js';
import { initHomeExplorer } from './ui/homeExplorer.js';
import { initHomeSkills } from './ui/homeSkills.js';
import { BRAND, storageKey, migrateStorage } from '../shared/brand.js';

migrateStorage();
// Testing aids (solo only): ?island=2 starts on island 2 (1-based), ?base=1..3
// with the team's base already standing on the first building plot.
const DEBUG_QUERY = new URLSearchParams(location.search);
const DEBUG_ISLAND = Math.max(0, (Number(DEBUG_QUERY.get('island')) || 1) - 1);
const DEBUG_BASE = Math.max(0, Math.min(3, Number(DEBUG_QUERY.get('base')) || 0));
const DEBUG_RAID = Math.max(0, Number(DEBUG_QUERY.get('raid')) || 0);   // ?raid=10: first raid in 10 s (with ?base)
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
const homeMenu = initHomeMenu();
const homeExplorer = initHomeExplorer();
const homeSkills = initHomeSkills();
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

// Load the real island backdrop after the interactive menu has painted.
let menuTour = null;
let tourAbort = null;
let tourIsland = 0;
let tourRequest = 0;
const tourDescriptions = [
  'Sunlit trails. Ancient giants. The beginning of your expedition.',
  'Still water. Tangled roots. Watch what moves beneath the surface.',
  'Black rock. Rising ash. An island forged in fire.',
];
async function startMenuTour() {
  const request = ++tourRequest;
  tourAbort?.abort();
  tourAbort = new AbortController();
  try {
    const { createMenuTour } = await import('./ui/menuTour.js');
    if (request !== tourRequest || menu.hidden) return;
    const tour = await createMenuTour($('menu-preview'), island => {
      if (request !== tourRequest) return;
      tourIsland = island.index;
      $('play-island').value = String(unlockedStartingIsland(island.index));
      for (const button of document.querySelectorAll('[data-island]')) {
        button.disabled = !!island.loading || Number(button.dataset.island) > availableStartingIsland();
        button.setAttribute('aria-pressed', String(Number(button.dataset.island) === island.index));
      }
      $('tour-next').disabled = !!island.loading;
      $('tour-title').textContent = island.name;
      $('tour-description').textContent = tourDescriptions[island.index];
      $('tour-count').textContent = `${String(island.index + 1).padStart(2, '0')} / 03`;
      $('tour-state').textContent = island.loading ? 'Preloading all island postcards…' : 'Solo expedition starts here';
      $('menu-preview').classList.toggle('is-loading', !!island.loading);
      $('preview-placeholder-copy').textContent = island.loading ? 'Unfolding the island postcards…' : 'Reconnaissance photos unavailable. Your expedition is still ready.';
      $('tour-motion').textContent = island.motionEnabled ? 'Pause tour' : 'Play tour';
      $('tour-motion').setAttribute('aria-pressed', String(!island.motionEnabled));
    }, { signal: tourAbort.signal });
    if (request !== tourRequest || menu.hidden) { tour.dispose(); return; }
    menuTour = tour;
    if (DEBUG_QUERY.has('debug')) window.__menuTour = tour;
    syncTourSuspension();
    $('tour-motion').disabled = false;
    $('tour-next').disabled = false;
  } catch (error) {
    if (request !== tourRequest || error.name === 'AbortError') return;
    console.warn('Island tour unavailable', error);
    $('tour-state').textContent = 'Welcome, explorer';
    $('tour-description').textContent = 'Start an expedition to discover the islands.';
  }
}
function stopMenuTour() {
  ++tourRequest;
  tourAbort?.abort();
  menuTour?.dispose();
  menuTour = null;
  $('tour-motion').disabled = true;
  $('tour-next').disabled = true;
}
$('tour-motion').addEventListener('click', () => menuTour?.toggleMotion());
async function selectPreviewIsland(index) {
  try { await menuTour?.setIsland(index); }
  catch (error) { console.warn('Island preview failed', error); $('tour-state').textContent = 'Could not load this preview'; }
}
$('tour-next').addEventListener('click', () => { void selectPreviewIsland((tourIsland + 1) % (availableStartingIsland() + 1)); });
$('tour-islands').addEventListener('click', event => {
  const button = event.target.closest('[data-island]');
  if (button && !button.disabled) void selectPreviewIsland(Number(button.dataset.island));
});
function syncTourSuspension() {
  menuTour?.setSuspended?.([...document.querySelectorAll('.home-dialog, #settings, #steam-friends')].some(root => !root.hidden));
}
const tourOverlayObserver = new MutationObserver(syncTourSuspension);
for (const root of document.querySelectorAll('.home-dialog, #settings, #steam-friends')) {
  tourOverlayObserver.observe(root, { attributes: true, attributeFilter: ['hidden'] });
}
window.addEventListener('pagehide', () => tourOverlayObserver.disconnect());
// Native Tab/Enter navigation also works; arrows provide quick menu selection.
menu.querySelector('.menu-buttons').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const actions = [...menu.querySelector('.menu-buttons').querySelectorAll('button')].filter(button => !button.disabled && !button.hidden);
  const index = actions.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
  event.preventDefault(); actions[next]?.focus();
});
requestAnimationFrame(() => setTimeout(startMenuTour, 100));
window.addEventListener('pagehide', stopMenuTour);

// The game module graph (about 4/5 of the client code) is not needed to show the
// menu: load it once the menu is up, so the first paint and clicks are not delayed.
let gameModule = null;
const loadGameModule = () => (gameModule ??= import('./core/game.js'));
(window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() => { loadGameModule().catch(() => { gameModule = null; }); }, { timeout: 4000 });

/** Show or hide the pause card; refresh its expedition/team info when shown. */
function setPaused(show) {
  if (show && paused.hidden) {
    renderPause(game);
    resetLeave();
    syncCreative();
  }
  paused.hidden = !show;
  if (show && !settingsUi.isOpen()) $('btn-resume').focus({ preventScroll: true });
  if (!show) settingsUi.close();
}
const served = location.protocol.startsWith('http');

function setBusy(busy, text = '') {
  for (const b of buttons) b.disabled = busy;
  $('btn-friends').disabled = busy || !steamLobby.available;
  status.textContent = text;
  homeMenu.feedback(text);
  for (const button of document.querySelectorAll('[data-home-panel], #btn-explorer, #btn-home-skills')) button.disabled = busy;
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
    const profile = loadProfile();   // saved XP and skills; the host re-validates them
    if (mode === 'internet') options.url = await internetTest.start();
    net = mode === 'steam' ? await Net.steam(window.dinoSteam, options, name, outfit, profile) :
      mode === 'online' || mode === 'internet' ? await Net.connect(websocketAddress(options.url ?? serverInput.value), name, outfit, profile) : await Net.local(name, outfit, { level: DEBUG_QUERY.has('island') ? DEBUG_ISLAND : unlockedStartingIsland(Number($('play-island').value)), baseStage: DEBUG_BASE, raidIn: DEBUG_RAID }, profile);
  } catch (err) {
    if (mode === 'internet') internetTest.stop();
    busy = false;
    setBusy(false, err.message || String(err));
    return;
  }
  menu.hidden = true;
  homeMenu.close();
  homeExplorer.close();
  homeSkills.close();
  stopMenuTour();
  steamLobby.updateSession(net.steamSession);
  menuAudio?.stopMusic();
  if (await launch(net)) setBusy(false, '');
  busy = false;
}

/**
 * Build and start a Game for the island in net.welcome. `reuse` hands over the
 * renderer, audio and input of the previous island's game.
 */
let keepCreative = false;
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
    const { Game } = await loadGameModule();
    game = new Game(canvas, net, reuse ?? (menuAudio ? { audio: menuAudio } : null));
    net.on(`ev:${EV.MISSION}`, ({ mission }) => {
      // This comes from the host after parts, repair and sailing are complete.
      // Creative expeditions and scenery previews do not earn map unlocks.
      if (mission.complete && mission.objectives.every(objective => objective.done) && !game.player.creative) {
        unlockIsland(mission.level.index + 1);
      }
    });
    if (DEBUG_QUERY.has('debug')) window.dinoGame = game;   // testing aid: inspect the running game
    loadingText.textContent = 'Preparing shaders…';
    // Compile up front so the first playable frames do not hitch; optional.
    await game.gfx.prepare().catch((e) => console.warn('Shader precompile failed', e));
  } catch (err) {
    console.error(err);
    net.close();
    internetTest.stop();
    loading.hidden = true;
    menu.hidden = false;
    void startMenuTour();
    menuAudio?.startMenuMusic();
    setBusy(false, `Could not start the game: ${err.message}`);
    return false;
  }
  // The game took over net.onClose; a disconnect during the precompile had no onLeave yet.
  if (net.closed) { backToMenu('Disconnected while loading the island'); return false; }
  window.__game = game; // handy for debugging in the console
  game.input.onLockChange = (locked) => {
    setPaused(!locked && game?.running && !game.hud.isPanelOpen() && !game.input.lockPending);
  };
  game.onPanelChange = () => setPaused(false);
  game.onLeave = (reason) => backToMenu(reason);
  // The team set sail: the server sends a fresh welcome for the next island.
  game.onNewIsland = (welcome) => {
    keepCreative = !!game.player.creative;   // the server keeps creative mode across islands; the new Game must too
    const shared = game.dispose();
    net.welcome = welcome;
    launch(net, shared);
  };
  loading.hidden = true;
  game.start();
  if (keepCreative) game.setCreative(true);
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
// Keep keyboard navigation inside the live menu; settings manages its own focus.
paused.addEventListener('keydown', event => {
  if (paused.hidden || settingsUi.isOpen()) return;
  const controls = [...paused.querySelectorAll('button, summary')].filter(el => !el.disabled && el.getClientRects().length);
  const index = controls.indexOf(document.activeElement);
  if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
    controls[next]?.focus();
  } else if (event.key === 'Tab' && (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0))) {
    event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
  }
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
nameInput.addEventListener('input', () => {
  try { localStorage.setItem(storageKey('name'), nameInput.value.slice(0, 14)); } catch { /* storage may be blocked */ }
});
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

// Explicit developer capture mode only: rebuild postcards after map art changes.
if (DEBUG_QUERY.has('capturePreviews')) {
  const captureRoot = document.createElement('div');
  captureRoot.hidden = true;
  const captureCanvas = document.createElement('canvas');
  captureRoot.append(captureCanvas); document.body.append(captureRoot);
  import('./ui/menuPreviewCapture.js').then(async ({ createMenuTour }) => {
    const capture = await createMenuTour(captureCanvas);
    capture.dispose();
  }).catch(error => console.warn('Postcard capture failed', error));
}
