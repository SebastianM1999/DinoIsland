const { app, BrowserWindow } = require('electron');

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
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
