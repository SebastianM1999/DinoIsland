const { app, BrowserWindow, shell, utilityProcess, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { installSteam } = require('./steam.cjs');
const { PersonalStore, identityFolder } = require('./personal-store.cjs');
// Window titles follow the packaged product name (see src/shared/brand.js).
const PRODUCT = require('../package.json').build.productName;
/** How long quitting waits for the final expedition save before giving up. */
const SHUTDOWN_TIMEOUT_MS = 8000;

// Testing: keep a run's saves and preferences in another folder (two "players" on one PC, clean starts).
if (process.env.DINO_USER_DATA) app.setPath('userData', path.resolve(process.env.DINO_USER_DATA));

let win = null;
let hostProcess = null;
let steam = null;
let personal = null;
let cleanedUp = false;
let quitting = null;

// One game per Windows user: a second launch (a Steam invite, a double click) focuses this one,
// so two processes never write the same expeditions.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); }
    steam?.handleArgs(argv);
  });
  app.whenReady().then(launch).catch((error) => {
    console.error(`Could not start ${PRODUCT}:`, error);
    dialog.showErrorBox(PRODUCT, `The game could not start: ${error.message}`);
    app.quit();
  });
}

/** Fork the host process (desktop/host-process.js) and wait until it listens. */
function startHost(demo) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'host-process.js'), demo ? ['--demo'] : [], { serviceName: `${PRODUCT} host`, stdio: 'inherit' });
    const onMessage = (message) => {
      if (message?.type === 'ready') { child.off('message', onMessage); resolve({ child, port: message.port }); }
      if (message?.type === 'failed') { child.off('message', onMessage); reject(new Error(message.error)); }
    };
    child.on('message', onMessage);
    child.once('exit', (code) => {
      reject(new Error(`The game host stopped (${code}).`));
      if (hostProcess === child && !quitting) {
        hostProcess = null;
        dialog.showErrorBox(PRODUCT, 'The game host stopped unexpectedly. Your expedition was autosaved; please restart the game.');
        app.quit();
      }
    });
  });
}

/** Send `message` to the host and wait for a reply of `type` (or the timeout). */
function askHost(message, type, timeoutMs) {
  const child = hostProcess;
  if (!child) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off('message', onMessage); resolve(null); }, timeoutMs);
    const onMessage = (reply) => {
      if (reply?.type !== type) return;
      clearTimeout(timer);
      child.off('message', onMessage);
      resolve(reply);
    };
    child.on('message', onMessage);
    child.postMessage(message);
  });
}

async function launch() {
  // the demo build: `--demo` or DINO_DEMO=1 (CONFIG.demo – island 1, two explorers, spear and bow)
  const demo = process.argv.includes('--demo') || process.env.DINO_DEMO === '1';
  const host = await startHost(demo);
  hostProcess = host.child;
  const localUrl = `http://127.0.0.1:${host.port}/`;
  const trusted = (event) => !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame &&
    new URL(event.senderFrame.url).origin === new URL(localUrl).origin;

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1f2a44',
    title: PRODUCT,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Local credit notices are plain text. Artist and license pages open in
    // the browser without granting those sites access to the game window.
    if (url === `${localUrl}assets/audio/CREDITS.md`) {
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 860, height: 680, title: `${PRODUCT} — audio credits`,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      } };
    }
    try {
      const link = new URL(url);
      const creditHosts = ['opengameart.org', 'freesound.org', 'kenney.nl', 'www.scottbuckley.com.au', 'creativecommons.org', 'elevenlabs.io'];
      if (link.protocol === 'https:' && creditHosts.includes(link.hostname)) {
        void shell.openExternal(url).catch(error => console.error('Could not open audio credit:', error));
      }
    } catch { /* invalid URL */ }
    return { action: 'deny' };
  });
  win.webContents.on('page-title-updated', (event) => event.preventDefault());
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localUrl)) event.preventDefault();
  });
  steam = await installSteam(app, win, localUrl, { demo });

  // Whose game this is: the Steam account in the Steam build, this computer's local player otherwise.
  // A Steam build without Steam never falls back to another player's (or an empty) folder.
  const saves = path.join(app.getPath('userData'), 'saves');
  const identity = steam.steamId ? identityFolder(steam.steamId) : steam.configured ? null : 'local';
  personal = new PersonalStore(saves, identity ?? 'local');
  ipcMain.on('dino:store:snapshot', (event) => { event.returnValue = trusted(event) ? personal.snapshot() : {}; });
  ipcMain.on('dino:store:set', (event, change) => { if (trusted(event)) personal.set(change?.key, change?.value ?? null); });
  const reply = await askHost(identity
    ? { type: 'identity', root: path.join(saves, 'profiles', identity, 'worlds') }
    : { type: 'identity', root: null, reason: 'Start Steam and sign in, then restart the game to load your expeditions.' }, 'identity-done', 15000);
  if (reply && !reply.ok) console.warn('[saves]', reply.reason);
  await win.loadURL(demo ? `${localUrl}?demo=1` : localUrl);
}

/** Save the open expedition, then stop the host, Steam and the preference files. */
async function cleanUp() {
  const result = await askHost({ type: 'shutdown' }, 'shutdown-done', SHUTDOWN_TIMEOUT_MS);
  if (!result) console.error('[saves] the host did not confirm the final save in time');
  else if (!result.ok) console.error('[saves] final save failed:', result.error);
  hostProcess?.kill();
  hostProcess = null;
  steam?.stop();
  steam = null;
  personal?.flush();
}

app.on('window-all-closed', () => app.quit());
// Quitting (menu, window close, Alt+F4) waits for the final save; a crash or a killed process
// keeps the last autosave instead.
app.on('before-quit', (event) => {
  if (cleanedUp) return;
  event.preventDefault();
  quitting ??= cleanUp().finally(() => { cleanedUp = true; app.quit(); });
});
