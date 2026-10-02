const { ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

async function installSteam(app, win, localUrl) {
  let session = null;
  let sdk = null;
  let pump = null;
  let failure = 'Steam co-op needs the Steam desktop build. Use an internet test or play solo.';
  const emit = event => { if (!win.isDestroyed()) win.webContents.send('dino:steam:event', event); };
  try {
    const config = require('./steam-config.json');
    const appId = Number(process.env.DINO_STEAM_APP_ID || process.env.SteamAppId || config.appId);
    if (!Number.isSafeInteger(appId) || appId < 1 || appId > 0xffffffff) {
      failure = 'Steam co-op is not configured yet. Use an internet test or play solo.';
    } else {
      const sdkPath = process.env.DINO_STEAM_SDK_PATH || path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'steamworks_sdk');
      const library = path.join(sdkPath, 'redistributable_bin', 'win64', 'steam_api64.dll');
      if (process.platform === 'win32' && !fs.existsSync(library)) {
        failure = 'Steam co-op is missing its runtime files. Install a complete Steam build.';
      } else {
        const { SteamworksSDK } = require('steamworks-ffi-node');
        sdk = SteamworksSDK.getInstance();
        sdk.setSdkPath(sdkPath);
        if (!sdk.init({ appId })) throw new Error('Start Steam, sign in, and restart the game to use Steam co-op.');
        const { SteamSession } = await import('./steam-session.js');
        session = new SteamSession(sdk, { emit });
        const lobbyId = sdk.matchmaking.getConnectLobbyIdFromCommandLine();
        if (lobbyId) session.requestJoin(lobbyId);
        pump = setInterval(() => {
          try { session.tick(); } catch (error) {
            console.error('[Steam] Networking failed:', error);
            session.endFromHost('Steam connection failed. Restart Steam and try again.');
          }
        }, 15);
      }
    }
  } catch (error) {
    console.error('[Steam] Initialization failed:', error);
    failure = 'Start Steam, sign in, and restart the game to use Steam co-op.';
    try { sdk?.shutdown(); } catch { /* initialization may be incomplete */ }
    sdk = null;
  }

  // Only the trusted game document can call these narrow APIs.
  function trusted(event) {
    return event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === new URL(localUrl).origin;
  }
  const handlers = {
    status: () => session ? session.status() : { available: false, reason: failure },
    friends: () => session.friends(),
    lobbies: () => session.lobbies(),
    host: visibility => session.hostGame(visibility),
    join: lobbyId => session.joinGame(lobbyId),
    leave: sessionId => {
      if (!sessionId || sessionId === session.sessionId) session.leave();
      return true;
    },
    invite: friendId => session.invite(friendId),
    dismissInvite: () => { session.pendingLobbyId = null; return true; },
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`dino:steam:${name}`, async (event, arg) => {
      if (!trusted(event)) return { error: 'Untrusted game window.' };
      try {
        if (name !== 'status' && !session) throw new Error(failure);
        return { value: await handler(arg) };
      } catch (error) { return { error: error.message || 'Steam request failed.' }; }
    });
  }
  function onSend(event, sessionId, message) {
    if (!trusted(event) || !session) return;
    try { session.send(sessionId, message); } catch { session.endFromHost('Invalid game message.'); }
  }
  ipcMain.on('dino:steam:send', onSend);
  const onNavigation = (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) session?.leave(); };
  win.webContents.on('did-start-navigation', onNavigation);
  win.webContents.on('render-process-gone', () => session?.leave());
  return () => {
    clearInterval(pump);
    session?.dispose();
    sdk?.shutdown();
    for (const name of Object.keys(handlers)) ipcMain.removeHandler(`dino:steam:${name}`);
    ipcMain.removeListener('dino:steam:send', onSend);
  };
}

module.exports = { installSteam };
