// Entry point: menu / lobby flow and game start.

import { Net } from './net/net.js';
import { CONFIG } from '../shared/config.js';
import { ICON_SPRITE, initSettings, renderPause } from './ui/menus.js';
import { savedOutfit } from './ui/wardrobe.js';
import { unlockedStartingIsland, availableStartingIsland } from './core/islandProgress.js';
import { readItem, writeItem, migrateLocalPreferences } from './core/persistence.js';
import { pickExpeditions } from './net/expeditions.js';
import { initExpeditionPanel, formatSavedAt } from './ui/expeditionPanel.js';
import { preloadDinoModels } from './models/dino/glbDino.js';
import { GameAudio } from './audio/audio.js';
import { initSteamLobby } from './ui/steamLobby.js';
import { initLanAddress, websocketAddress } from './net/lan.js';
import { initInternetTest } from './ui/internetTest.js';
import { initHomeMenu } from './ui/homeMenu.js';
import { initHomeExplorer } from './ui/homeExplorer.js';
import { initHomeSkills } from './ui/homeSkills.js';
import { initLoadingScreen } from './ui/loadingScreen.js';
import { mapPreviewFrames, preloadMapPreviews } from './ui/mapPreviews.js';
import { LEVELS } from '../shared/levels.js';
import { BRAND, storageKey, migrateStorage } from '../shared/brand.js';
import { preloadCaveBake } from '../shared/caveBakeLoad.js';

migrateStorage();
migrateLocalPreferences();   // (desktop: preferences an older build kept in this origin's localStorage)
// Testing aids (solo only): ?island=2 starts on island 2 (1-based), ?base=1..3
// with the team's base already standing on the first building plot.
const DEBUG_QUERY = new URLSearchParams(location.search);
const DEBUG_ISLAND = Math.max(0, (Number(DEBUG_QUERY.get('island')) || 1) - 1);
const DEBUG_VARIANT = Number(DEBUG_QUERY.get('variant')) || undefined;   // ?variant=7: a fixed island layout (screenshots, bug reports)
const DEBUG_BASE = Math.max(0, Math.min(3, Number(DEBUG_QUERY.get('base')) || 0));
const DEBUG_RAID = Math.max(0, Number(DEBUG_QUERY.get('raid')) || 0);   // ?raid=10: first raid in 10 s (with ?base)
const DEBUG_DEV = DEBUG_QUERY.has('dev') || DEBUG_QUERY.has('pin');   // ?dev: the dev pin tool (F8, client/core/devPins.js)
// Any testing aid starts an unsaved solo session straight away instead of the expedition picker.
const DEBUG_START = ['island', 'variant', 'base', 'raid', 'dev', 'pin', 'demo'].some((k) => DEBUG_QUERY.has(k));
const expeditions = pickExpeditions();
// The demo (CONFIG.demo): ?demo=1, or a demo server says so in /status (pollLobby). Solo games then run
// the demo too; the menu offers neither other islands nor the skill tree.
let demo = DEBUG_QUERY.get('demo') === '1';
function applyDemoMenu() {
  if (!demo) return;
  document.body.classList.add('is-demo');
  $('play-island').value = '0';
  for (const id of ['btn-home-skills', 'tour-next']) { const b = $(id); if (b) b.hidden = true; }
  const kicker = document.querySelector('.menu-kicker');
  if (kicker) kicker.textContent = `Co-op dinosaur survival · demo · 1–${CONFIG.demo.maxPlayers} explorers`;
}
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
const loadingUi = initLoadingScreen(loading);
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

// Photograph slideshow behind the menu (no WebGL, no map models): see ui/menuPostcards.js.
let menuPostcards = null;
let postcardAbort = null;
let postcardIsland = 0;
let postcardRequest = 0;
async function startMenuPostcards() {
  const request = ++postcardRequest;
  postcardAbort?.abort();
  postcardAbort = new AbortController();
  $('menu-preview').classList.remove('is-booting');
  $('tour-next').disabled = false;
  try {
    const { createMenuPostcards } = await import('./ui/menuPostcards.js');
    const postcards = await createMenuPostcards($('menu-preview'), island => {
      if (request !== postcardRequest) return;
      postcardIsland = island.index;
      $('play-island').value = String(demo ? 0 : unlockedStartingIsland(island.index));
      $('tour-next').disabled = false;
    }, { signal: postcardAbort.signal });
    if (request !== postcardRequest || menu.hidden) { postcards.dispose(); return; }
    menuPostcards = postcards;
    if (DEBUG_QUERY.has('debug')) window.__menuPostcards = postcards;
    syncPostcardSuspension();
  } catch (error) {
    if (request !== postcardRequest || error.name === 'AbortError') return;
    console.warn('Island slideshow unavailable', error);
    $('tour-next').disabled = true;
  }
}
function stopMenuPostcards() {
  ++postcardRequest;
  postcardAbort?.abort();
  menuPostcards?.dispose();
  menuPostcards = null;
  $('tour-next').disabled = true;
}
async function selectPreviewIsland(index) {
  postcardIsland = index;
  $('play-island').value = String(demo ? 0 : unlockedStartingIsland(index));
  await menuPostcards?.setIsland(index);
}
$('tour-next').addEventListener('click', () => { void selectPreviewIsland((postcardIsland + 1) % (availableStartingIsland() + 1)); });
function syncPostcardSuspension() {
  const suspended = [...document.querySelectorAll('.home-dialog, #settings, #steam-friends')].some(root => !root.hidden);
  menuPostcards?.setSuspended(suspended);
}
const postcardOverlayObserver = new MutationObserver(syncPostcardSuspension);
for (const root of document.querySelectorAll('.home-dialog, #settings, #steam-friends')) {
  postcardOverlayObserver.observe(root, { attributes: true, attributeFilter: ['hidden'] });
}
window.addEventListener('pagehide', () => postcardOverlayObserver.disconnect());
// Native Tab/Enter navigation also works; arrows provide quick menu selection.
menu.querySelector('.menu-buttons').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const actions = [...menu.querySelector('.menu-buttons').querySelectorAll('button')].filter(button => !button.disabled && !button.hidden);
  const index = actions.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
  event.preventDefault(); actions[next]?.focus();
});
requestAnimationFrame(() => setTimeout(startMenuPostcards, 100));
window.addEventListener('pagehide', stopMenuPostcards);

// The game module graph (about 4/5 of the client code) is not needed to show the
// menu: load it once the menu is up, so the first paint and clicks are not delayed.
let gameModule = null;
const loadGameModule = () => (gameModule ??= import('./core/game.js'));
(window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() => { loadGameModule().catch(() => { gameModule = null; }); }, { timeout: 4000 });

/** Show or hide the pause card; refresh its expedition/team info when shown. */
let pauseRefresh = null;
function setPaused(show) {
  if (show && paused.hidden) {
    renderPause(game);
    resetLeave();
    syncCreative();
    renderSaveStatus();
  }
  clearInterval(pauseRefresh);
  pauseRefresh = null;
  paused.hidden = !show;
  if (show) pauseRefresh = setInterval(() => {
    if (game?.running && !paused.hidden && !document.hidden) { renderPause(game); renderSaveStatus(); }
  }, 1000);
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
  writeItem(storageKey('name'), name);
  setBusy(true, mode === 'online' ? 'Connecting…' : 'Starting…');
  const startingIsland = mode === 'expedition' && options.choice.id ? options.choice.island ?? 0 : unlockedStartingIsland(Number($('play-island').value));
  void loadingUi.start({ islandName: LEVELS[startingIsland].name, frames: mapPreviewFrames(startingIsland) });
  // Stop construction before starting the worker/network, not after connecting.
  stopMenuPostcards();
  let net;
  try {
    const outfit = savedOutfit();
    if (mode === 'internet' || options.purpose === 'internet') options.url = await internetTest.start();
    if (mode === 'expedition') {
      // a saved expedition: solo (private) or hosted for friends (open), see net/expeditions.js
      const choice = options.choice.create ? { create: { ...options.choice.create, level: startingIsland } } : { id: options.choice.id };
      const steam = options.purpose === 'steam' ? { bridge: window.dinoSteam, visibility: $('lobby-visibility').value } : null;
      net = await expeditions.start({ ...choice, lobby: options.purpose === 'solo' ? 'private' : 'open', url: options.url, steam }, { name, outfit });
    } else net = mode === 'steam' ? await Net.steam(window.dinoSteam, options, name, outfit) :
      mode === 'online' || mode === 'internet' ? await Net.connect(websocketAddress(options.url ?? serverInput.value), name, outfit) : await Net.local(name, outfit, { level: demo ? 0 : DEBUG_QUERY.has('island') ? DEBUG_ISLAND : unlockedStartingIsland(Number($('play-island').value)), variant: DEBUG_VARIANT, dev: DEBUG_DEV, baseStage: DEBUG_BASE, raidIn: DEBUG_RAID, demo });
  } catch (err) {
    if (mode === 'internet' || options.purpose === 'internet') internetTest.stop();
    busy = false;
    loadingUi.stop();
    void startMenuPostcards();
    setBusy(false, err.message || String(err));
    return;
  }
  menu.hidden = true;
  homeMenu.close();
  homeExplorer.close();
  homeSkills.close();
  stopMenuPostcards();
  steamLobby.updateSession(net.steamSession);
  menuAudio?.stopMusic();
  if (await launch(net, null, { openMenu: !!options.openMenu })) setBusy(false, '');
  busy = false;
}

/**
 * Build and start a Game for the island in net.welcome. `reuse` hands over the
 * renderer, audio and input of the previous island's game.
 */
let keepCreative = false;
async function launch(net, reuse = null, { openMenu = false } = {}) {
  net.beginLoading();
  let disconnectReason = 'Disconnected while loading the island';
  const buildAbort = new AbortController();
  net.onClose = reason => {
    disconnectReason = reason || disconnectReason;
    buildAbort.abort(new Error(disconnectReason));
  };
  const lv = net.welcome.world.level;
  // Decorative photographs must never delay simulation or shader loading.
  void preloadMapPreviews(lv.index);
  void loadingUi.start({ islandName: LEVELS[lv.index]?.name || `Island ${lv.index + 1}`, frames: mapPreviewFrames(lv.index) });
  loadingUi.setStage('dinosaurs');
  // Let the loading screen paint before the heavy world build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  try {
    await preloadDinoModels((done, total) => {
      loadingUi.setStage('dinosaurs', { done, total });
    });
    if (net.closed) throw new Error(disconnectReason);
    loadingUi.setStage('island');
    // the Hollow Mountain's baked mesh and walk grid, if the site has them (assets/cave): the island then builds in a second, not seven
    await preloadCaveBake(lv.index, lv.variant);
    const { Game } = await loadGameModule();
    game = await Game.create(canvas, net, reuse ?? (menuAudio ? { audio: menuAudio } : null), { signal: buildAbort.signal });
    if (DEBUG_QUERY.has('debug')) window.dinoGame = game;   // testing aid: inspect the running game
    // Developer photo studio for the menu photographs (scripts/capturePreviews.mjs); never loaded otherwise.
    if (DEBUG_QUERY.has('capturePreviews')) void import('./ui/menuPreviewCapture.js').then(({ installPreviewCapture }) => { window.__previewCapture = installPreviewCapture(game); });
    loadingUi.setStage('shaders');
    // Compile up front so the first playable frames do not hitch; optional.
    await game.gfx.prepare().catch((e) => console.warn('Shader precompile failed', e));
  } catch (err) {
    console.error(err);
    net.close();
    internetTest.stop();
    loadingUi.stop();
    // A failed expedition transition has already retired its previous Game.
    // Reload through the normal teardown so the borrowed renderer/input shell
    // cannot survive behind a new menu or another launch.
    if (reuse) { backToMenu(`Could not start the game: ${err.message}`); return false; }
    menu.hidden = false;
    void startMenuPostcards();
    menuAudio?.startMenuMusic();
    setBusy(false, `Could not start the game: ${err.message}`);
    return false;
  }
  // The game took over net.onClose; a disconnect during the precompile had no onLeave yet.
  if (net.closed) { backToMenu('Disconnected while loading the island'); return false; }
  window.__game = game; // handy for debugging in the console
  if (DEBUG_DEV) {
    // dev pin tool (F8): reports into dev-pins/ via the dev server; ?pin=<id> revisits one (client/core/devPins.js)
    const { installDevPins } = await import('./core/devPins.js');
    const pins = installDevPins(game, { pinId: reuse ? null : DEBUG_QUERY.get('pin') });   // (only the first island revisits)
    const dispose = game.dispose.bind(game);
    game.dispose = (...args) => { pins.dispose(); return dispose(...args); };
  }
  game.input.onLockChange = (locked) => {
    setPaused(!locked && game?.running && !game.hud.isPanelOpen() && !game.input.lockPending);
  };
  // The mouse could not be captured (the browser wants a click first): play on, unpaused, and
  // ask for that click instead of opening the pause menu over the island.
  game.input.onLockFailed = () => {
    if (game?.running && paused.hidden && !game.hud.isPanelOpen()) game.hud.toast('Click to look around');
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
  net.endLoading();
  if (net.closed) { backToMenu('Disconnected while loading the island'); return false; }
  loadingUi.stop();
  game.start();
  if (keepCreative) game.setCreative(true);
  if (openMenu) {
    game.input.exitLock();
    setPaused(true);
  } else {
    // Spawn straight into the island: the lock arrives asynchronously, and if the browser
    // refuses it a click on the canvas captures the mouse (onLockFailed), never the pause menu.
    setPaused(false);
    game.input.requestLock();
  }
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
  if (document.activeElement === $('friend-internet-address')) start('online', { url: $('friend-internet-address').value, openMenu: true });
  else start('online', { openMenu: true });
});
// Solo play and (on the desktop) hosting go through the saved expeditions; testing aids start unsaved.
const expeditionPanel = initExpeditionPanel({
  backend: expeditions,
  open: (name) => homeMenu.open(name),
  onPlay: (choice, purpose) => { void start('expedition', { choice, purpose, openMenu: purpose !== 'solo' }); },
});
const hostsExpeditions = expeditions.kind === 'host';
$('btn-solo').addEventListener('click', () => { if (DEBUG_START) void start('local'); else void expeditionPanel.open('solo'); });
$('btn-host-internet').addEventListener('click', () => {
  if (hostsExpeditions) void expeditionPanel.open('internet');
  else void start('internet', { url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` });
});
$('btn-join-internet').addEventListener('click', () => start('online', { url: $('friend-internet-address').value, openMenu: true }));
const hostLan = () => {
  if (hostsExpeditions) void expeditionPanel.open('lan');
  else void start('online', { url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` });
};
$('btn-host-lan').addEventListener('click', hostLan);
$('btn-host').addEventListener('click', async () => {
  await steamLobby.ready;
  // the desktop hosts a saved expedition for Steam friends too; a page without saves hosts a session world
  if (steamLobby.available) { if (hostsExpeditions) void expeditionPanel.open('steam'); else void start('steam', { host: true, visibility: $('lobby-visibility').value }); }
  else hostLan();
});
const steamLobby = initSteamLobby({
  join: lobbyId => start('steam', { lobbyId, openMenu: true }),
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
// Escape leaves the pause menu again. The Escape that released the mouse opened it; a key
// event arriving together with that opening is the same press, not a second one.
let pausedAt = 0;
new MutationObserver(() => { if (!paused.hidden) pausedAt = performance.now(); }).observe(paused, { attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat || paused.hidden || settingsUi.isOpen()) return;
  if (performance.now() - pausedAt < 250) return;
  event.preventDefault();
  resumeGame();
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
let forceQuit = false;   // the last Save & quit failed: the next confirmed click quits without saving
function resetLeave() {
  clearTimeout(leaveTimer);
  delete leaveBtn.dataset.confirm;
  leaveBtn.lastElementChild.textContent = forceQuit ? 'Quit without saving' : game?.net.expedition ? 'Save & quit' : 'Leave game';
}
/** The pause card's save line: when this expedition was last saved, or why it is not saved. */
function renderSaveStatus() {
  const line = $('pause-save');
  const net = game?.net;
  if (!net) { line.textContent = ''; return; }
  const s = net.saveStatus;
  line.classList.toggle('is-error', !!s && !s.ok);
  if (s && !s.ok) line.textContent = `Saving failed: ${s.error}`;
  else if (net.expedition) line.textContent = `${net.expedition.name} · ${formatSavedAt(net.expedition.savedAt)}`;
  else line.textContent = net.mode === 'local' ? 'Testing session: not saved.' : 'This session is not saved on this computer.';
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
leaveBtn.addEventListener('click', async () => {
  if (!leaveBtn.dataset.confirm) {
    leaveBtn.dataset.confirm = '1';
    leaveBtn.lastElementChild.textContent = forceQuit ? 'Click again: progress since the last save is lost' : game?.net.expedition ? 'Click again to save and quit' : 'Click again to leave';
    leaveTimer = setTimeout(resetLeave, 3000);
    return;
  }
  const net = game?.net;
  if (net?.expedition) {
    // Save & quit: wait for the save before leaving; a failed save keeps the expedition running
    clearTimeout(leaveTimer);
    leaveBtn.disabled = true;
    leaveBtn.lastElementChild.textContent = 'Saving…';
    game.onLeave = () => {};   // (the host closing the expedition is expected now)
    const result = await expeditions.saveAndQuit(net, { force: forceQuit });
    leaveBtn.disabled = false;
    if (!result.ok) {
      game.onLeave = (reason) => backToMenu(reason);
      net.reportSave({ ok: false, at: Date.now(), reason: 'quit', error: result.error });
      forceQuit = true;
      resetLeave();
      renderSaveStatus();
      return;
    }
    net.close();
    backToMenu(forceQuit ? '' : `"${net.expedition.name}" was saved.`);
    return;
  }
  net?.close();
  backToMenu('');
});

nameInput.value = readItem(storageKey('name')) || '';
nameInput.addEventListener('input', () => { writeItem(storageKey('name'), nameInput.value.slice(0, 14)); });
serverInput.value = served ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : `ws://localhost:${CONFIG.net.port}`;
applyDemoMenu();
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
      if (s.demo && !demo) { demo = true; applyDemoMenu(); }
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
        if (s.players.length >= s.maxPlayers) status.textContent = `The server is full (${s.maxPlayers}/${s.maxPlayers}).`;
      }
    } catch {
      status.textContent = 'No co-op server found – you can still play solo.';
    }
  }
  setTimeout(pollLobby, 2000);
}
pollLobby();
void initLanAddress();
