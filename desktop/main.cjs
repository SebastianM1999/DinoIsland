const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { installSteam } = require('./steam.cjs');
// Window titles follow the packaged product name (see src/shared/brand.js).
const PRODUCT = require('../package.json').build.productName;

let server;
let gameHost;
let stopSteam;
let internet;

async function launch() {
  const { createGameServer } = await import('../server/index.js');
  const { httpServer, host, internet: internetHost } = createGameServer();
  internet = internetHost;
  server = httpServer;
  gameHost = host;
  // The desktop game also hosts a WebSocket server for LAN co-op.
  const requestedPort = Number(process.env.DINO_DESKTOP_PORT) || 0;
  const port = await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(requestedPort, '0.0.0.0', () => {
      httpServer.off('error', reject);
      resolve(httpServer.address().port);
    });
  });
  const localUrl = `http://127.0.0.1:${port}/`;
  const win = new BrowserWindow({
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
  stopSteam = await installSteam(app, win, localUrl);
  await win.loadURL(localUrl);
}

app.whenReady().then(launch).catch((error) => {
  console.error(`Could not start ${PRODUCT}:`, error);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { internet?.stop(); stopSteam?.(); stopSteam = null; gameHost?.stop(); server?.close(); });
