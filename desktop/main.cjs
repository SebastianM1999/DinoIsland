const { app, BrowserWindow, shell, utilityProcess, ipcMain, dialog } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { startSteamForApp, installSteam } = require('./steam.cjs');
const { PersonalStore, identityFolder } = require('./personal-store.cjs');
const { openLog, captureConsole, pipeLines, buildInfo } = require('./logFile.cjs');
const { fromGamePage } = require('./trust.cjs');
// Window titles follow the packaged product name (see src/shared/brand.js).
const PRODUCT = require('../package.json').build.productName;
/** How long quitting waits for the final expedition save before giving up. */
const SHUTDOWN_TIMEOUT_MS = 8000;

// Testing: keep a run's saves and preferences in another folder (two "players" on one PC, clean starts).
if (process.env.DINO_USER_DATA) app.setPath('userData', path.resolve(process.env.DINO_USER_DATA));

let win = null;
let hostProcess = null;
let steam = null;
let steamStarted = null;   // the Steam API, started before the window (desktop/steamStart.cjs)
let personal = null;
let cleanedUp = false;
let quitting = null;
let log = null;

/** Tell the player something went wrong, and where the details are. */
function showError(message) {
  dialog.showErrorBox(PRODUCT, log?.file ? `${message}\n\nDetails are in the log file:\n${log.file}` : message);
}

// One game per Windows user: a second launch (a Steam invite, a double click) focuses this one,
// so two processes never write the same expeditions (or the same log).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // The log first, so every later step, a failed start included, is written down (desktop/logFile.cjs).
  log = openLog(path.join(app.getPath('userData'), 'logs'), {
    header: buildInfo({ product: PRODUCT, version: app.getVersion(), osRelease: os.release(), packaged: app.isPackaged }),
  });
  captureConsole(log);
  process.on('uncaughtException', (error) => {
    console.error('Unexpected error in the main process:', error);
    showError(`${PRODUCT} ran into an unexpected error and will close. Your expedition is saved on the way out.`);
    app.quit();
  });
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection in the main process:', error));
  // (a crashed GPU or renderer process: Chromium usually recovers, but the log should say it happened)
  app.on('child-process-gone', (_event, details) => console.warn('A helper process stopped:', details.type, details.reason, details.exitCode));
  app.on('second-instance', (_event, argv) => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); }
    steam?.handleArgs(argv);
  });
  app.whenReady().then(launch).catch((error) => {
    console.error(`Could not start ${PRODUCT}:`, error);
    showError(`The game could not start: ${error.message}`);
    app.quit();
  });
}

/** Fork the host process (desktop/host-process.js) and wait until it listens. */
function startHost() {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'host-process.js'), [], { serviceName: `${PRODUCT} host`, stdio: 'pipe' });
    // (its output goes to the log, and on to the terminal of a developer running `npm run desktop`)
    pipeLines(child.stdout, log, 'info', 'host', process.stdout);
    pipeLines(child.stderr, log, 'error', 'host', process.stderr);
    const onMessage = (message) => {
      if (message?.type === 'ready') { child.off('message', onMessage); resolve({ child, port: message.port }); }
      if (message?.type === 'failed') { child.off('message', onMessage); reject(new Error(message.error)); }
    };
    child.on('message', onMessage);
    child.once('exit', (code) => {
      reject(new Error(`The game host stopped (${code}).`));
      if (hostProcess === child && !quitting) {
        hostProcess = null;
        console.error(`The host process stopped unexpectedly (exit code ${code}).`);
        showError('The game host stopped unexpectedly. Your expedition was autosaved; please restart the game.');
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
  // Steam before any window exists: the overlay hooks the graphics device when it is created
  // (desktop/steamStart.cjs). A Steam build started outside Steam is relaunched by Steam.
  const started = steamStarted = startSteamForApp(app);
  if (started.restart) { app.exit(0); return; }
  if (started.failure) console.warn('[Steam]', started.failure);

  const host = await startHost();
  hostProcess = host.child;
  const localUrl = `http://127.0.0.1:${host.port}/`;
  const trusted = (event) => fromGamePage(event, win, localUrl);

  // Whose game this is: the Steam account in the Steam build, this computer's local player otherwise.
  // A Steam build without Steam never falls back to another player's (or an empty) folder.
  const saves = path.join(app.getPath('userData'), 'saves');
  const identity = started.steamId ? identityFolder(started.steamId) : started.configured ? null : 'local';
  personal = new PersonalStore(saves, identity ?? 'local');
  ipcMain.on('dino:store:snapshot', (event) => { event.returnValue = trusted(event) ? personal.snapshot() : {}; });
  ipcMain.on('dino:store:set', (event, change) => { if (trusted(event)) personal.set(change?.key, change?.value ?? null); });
  const reply = await askHost(identity
    ? { type: 'identity', root: path.join(saves, 'profiles', identity, 'worlds') }
    : { type: 'identity', root: null, reason: 'Start Steam and sign in, then restart the game to load your expeditions.' }, 'identity-done', 15000);
  if (reply && !reply.ok) console.warn('[saves]', reply.reason);

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
  // the game page's warnings and errors (its info lines stay in DevTools: the log is for problems)
  win.webContents.on('console-message', (event) => {
    if (event.level === 'warning' || event.level === 'error') log.write(event.level === 'warning' ? 'warn' : 'error', 'game', `${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => console.error('The game window stopped:', details.reason, details.exitCode));
  win.webContents.on('unresponsive', () => console.warn('The game window is not responding'));
  // Steam lobbies feed the expedition in the host process (desktop/hostBridge.js), never a world of their own
  const { createRemoteHost } = await import('./hostBridge.js');
  const channel = {
    postMessage: (message) => hostProcess?.postMessage(message),
    on: (event, fn) => host.child.on(event, fn),
    off: (event, fn) => host.child.off(event, fn),
  };
  const remoteHost = createRemoteHost(channel);
  steam = await installSteam(win, localUrl, started, { createHost: () => remoteHost });
  await win.loadURL(localUrl);
}

/** Save the open expedition, then stop the host, Steam and the preference files. */
async function cleanUp() {
  const result = await askHost({ type: 'shutdown' }, 'shutdown-done', SHUTDOWN_TIMEOUT_MS);
  if (!result) console.error('[saves] the host did not confirm the final save in time');
  else if (!result.ok) console.error('[saves] final save failed:', result.error);
  else console.log('[saves] final save done, closing');
  hostProcess?.kill();
  hostProcess = null;
  // (Steam started, but the window never got that far: shut the API down here)
  if (steam) steam.stop();
  else try { steamStarted?.sdk?.shutdown(); } catch { /* already gone */ }
  steam = steamStarted = null;
  personal?.flush();
}

app.on('window-all-closed', () => app.quit());
// Quitting (menu, window close, Alt+F4) waits for the final save; a crash or a killed process
// keeps the last autosave instead.
app.on('before-quit', (event) => {
  if (cleanedUp || !log) return;   // (no log: the second instance that hands over to the first)
  event.preventDefault();
  quitting ??= cleanUp().finally(() => { cleanedUp = true; app.quit(); });
});
