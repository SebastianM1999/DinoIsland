// The desktop game's host, in its own Electron utility process (desktop/main.cjs forks it):
// serves the game page, hosts the owner's saved expeditions (solo with a private lobby; Steam,
// internet and LAN friends with an open one) and writes their saves. Running here, world ticks and save
// captures never block the window, IPC or the Steam pump of the main process.
//
// main -> host  { type: 'identity', root } | { type: 'identity', root: null, reason }
//               { type: 'shutdown' }
//               conn-open / conn-msg / conn-close: Steam players (desktop/hostBridge.js)
// host -> main  { type: 'ready', port } | { type: 'identity-done', ok, reason } | conn-send / conn-close
//               { type: 'shutdown-done', ok, error? } | { type: 'failed', error }

import { createGameServer } from '../server/index.js';
import { createBridgeEndpoint } from './hostBridge.js';

const parent = process.parentPort;

try {
  const { httpServer, host, internet, saves } = createGameServer({ saves: true, lanPort: Number(process.env.DINO_LAN_PORT) || undefined });
  const port = await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    // (this machine only: the game window, Steam through the bridge, the internet tunnel; a hosted LAN
    // game opens its own LAN port, server/lanListener.js, so solo and Steam games open none)
    httpServer.listen(Number(process.env.DINO_DESKTOP_PORT) || 0, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve(httpServer.address().port);
    });
  });
  let shuttingDown = null;
  // Steam players, bridged from the main process (desktop/hostBridge.js)
  const bridge = createBridgeEndpoint(host, (message) => parent.postMessage(message));
  parent.on('message', async ({ data }) => {
    if (bridge(data)) return;
    if (data?.type === 'identity') {
      let ok = false;
      if (data.root) ok = await saves.useRoot(data.root).catch((error) => { saves.setUnavailable(`The save folder cannot be used: ${error.message}`); return false; });
      else saves.setUnavailable(data.reason || 'Expeditions are unavailable.');
      parent.postMessage({ type: 'identity-done', ok, reason: saves.status().reason });
    } else if (data?.type === 'shutdown') {
      shuttingDown ??= saves.shutdown().catch((error) => ({ ok: false, error: error.message })).then((result) => {
        internet.stop();
        host.stop();
        httpServer.closeAllConnections?.();
        httpServer.close();
        return result;
      });
      parent.postMessage({ type: 'shutdown-done', ...(await shuttingDown) });
    }
  });
  parent.postMessage({ type: 'ready', port });
} catch (error) {
  parent.postMessage({ type: 'failed', error: error.message });
}
