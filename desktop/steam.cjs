const { ipcMain } = require('electron');
const path = require('node:path');
const { startSteam } = require('./steamStart.cjs');
const { fromGamePage } = require('./trust.cjs');

/** Start the Steam API before any window exists (desktop/steamStart.cjs). */
function startSteamForApp(app, log = console) {
  return startSteam({
    sdkPath: process.env.DINO_STEAM_SDK_PATH || path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'steamworks_sdk'),
    packaged: app.isPackaged,
    config: require('./steam-config.json'),
    log,
  });
}

/**
 * Wire the started Steam API (`started`, from startSteamForApp) to the game window: Steam lobbies,
 * friends and invites for the trusted game page. createHost: the game host Steam lobbies feed
 * (desktop/hostBridge.js: the saved expedition in the host process).
 */
async function installSteam(win, localUrl, started, { createHost } = {}) {
  let session = null;
  let pump = null;
  const { sdk, failure } = started;
  const emit = event => { if (!win.isDestroyed()) win.webContents.send('dino:steam:event', event); };
  if (sdk) {
    const { SteamSession } = await import('./steam-session.js');
    session = new SteamSession(sdk, { emit, ...(createHost ? { createHost } : {}) });
    // (started from a Steam invite: the lobby is on our command line)
    const lobbyId = sdk.matchmaking.getConnectLobbyIdFromCommandLine();
    if (lobbyId) session.requestJoin(lobbyId);
    pump = setInterval(() => {
      try { session.tick(); } catch (error) {
        console.error('[Steam] Networking failed:', error);
        session.endFromHost('Steam connection failed. Restart Steam and try again.');
      }
    }, 4);   // every pump receives and flushes; this bounds the added latency per hop
  }

  // Only the trusted game document can call these narrow APIs.
  const trusted = (event) => fromGamePage(event, win, localUrl);
  const handlers = {
    status: () => session ? session.status() : { available: false, reason: failure },
    friends: () => session.friends(),
    lobbies: () => session.lobbies(),
    host: arg => (arg && typeof arg === 'object' ? session.hostGame(arg.visibility, arg.ownerToken ?? null) : session.hostGame(arg)),
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
  /** A second launch (a Steam invite while the game runs) hands its command line to this instance. */
  function handleArgs(argv) {
    const i = argv.indexOf('+connect_lobby');
    const lobbyId = i >= 0 ? argv[i + 1] : null;
    if (session && lobbyId) session.requestJoin(lobbyId);
  }
  const stop = () => {
    clearInterval(pump);
    session?.dispose();
    sdk?.shutdown();
    for (const name of Object.keys(handlers)) ipcMain.removeHandler(`dino:steam:${name}`);
    ipcMain.removeListener('dino:steam:send', onSend);
  };
  return { stop, handleArgs };
}

module.exports = { startSteamForApp, installSteam };
