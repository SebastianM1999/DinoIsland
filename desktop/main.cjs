const { app, BrowserWindow, shell } = require('electron');

let server;
let gameHost;

async function launch() {
  const { createGameServer } = await import('../server/index.js');
  const { httpServer, host } = createGameServer();
  server = httpServer;
  gameHost = host;
  // The desktop game also hosts a WebSocket server for LAN co-op.
  const requestedPort = Number(process.env.DINO_DESKTOP_PORT) || 8080;
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
    title: `Dinosaur Island — co-op port ${port}`,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Local credit notices are plain text. Artist and license pages open in
    // the browser without granting those sites access to the game window.
    if (url === `${localUrl}assets/audio/CREDITS.md`) {
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 860, height: 680, title: 'Dinosaur Island — audio credits',
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
  await win.loadURL(localUrl);
}

app.whenReady().then(launch).catch((error) => {
  console.error('Could not start Dinosaur Island:', error);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { gameHost?.stop(); server?.close(); });
