// Starting the Steam API, before the game creates any window (desktop/main.cjs): Valve asks for
// SteamAPI_Init before the graphics device exists, so the overlay can hook the game's rendering.
// A packaged Steam build that was started directly (its .exe, not through Steam) is relaunched
// through Steam first, so the overlay, invites and the signed-in account always work.
// No Electron here: desktop/steam.cjs wires the started SDK to the window and the game host.
const path = require('node:path');
const fs = require('node:fs');

const STEAM_ID = /^[1-9]\d{15,19}$/;

/**
 * Returns { sdk, appId, configured, steamId, failure, restart }:
 * - configured: a real App ID is set (this is the Steam build), even when Steam itself failed;
 * - restart: Steam relaunches the game; quit at once without opening anything;
 * - sdk: the initialized SDK, or null with `failure` (shown to the player; solo still works).
 * `sdkPath`: the folder with the Steamworks redistributables; `packaged`: app.isPackaged.
 */
function startSteam({ sdkPath, packaged = false, config = {}, env = process.env, platform = process.platform,
  exists = fs.existsSync, loadSdk = () => require('steamworks-ffi-node').SteamworksSDK.getInstance(), log = console } = {}) {
  const appId = Number(env.DINO_STEAM_APP_ID || env.SteamAppId || config.appId);
  if (!Number.isSafeInteger(appId) || appId < 1 || appId > 0xffffffff) {
    return { sdk: null, appId: null, configured: false, steamId: null, restart: false, failure: 'Steam co-op is not configured yet. Solo is available.' };
  }
  const failed = (failure) => ({ sdk: null, appId, configured: true, steamId: null, restart: false, failure });
  if (platform === 'win32' && !exists(path.join(sdkPath, 'redistributable_bin', 'win64', 'steam_api64.dll'))) {
    return failed('Steam co-op is missing its runtime files. Install a complete Steam build.');
  }
  let sdk = null;
  try {
    sdk = loadSdk();
    sdk.setSdkPath(sdkPath);
    // (only a packaged build: a source checkout run with `npm run desktop` must never start the installed game)
    if (packaged && sdk.restartAppIfNecessary(appId)) {
      log.info?.('[Steam] Started outside Steam: relaunching through Steam');
      return { sdk: null, appId, configured: true, steamId: null, restart: true, failure: null };
    }
    if (!sdk.init({ appId })) throw new Error('SteamAPI_Init failed');
    const id = String(sdk.getStatus().steamId ?? '');
    return { sdk, appId, configured: true, steamId: STEAM_ID.test(id) && BigInt(id) <= 0xffffffffffffffffn ? id : null, restart: false, failure: null };
  } catch (error) {
    log.error('[Steam] Initialization failed:', error);
    try { sdk?.shutdown(); } catch { /* initialization may be incomplete */ }
    return failed('Start Steam, sign in, and restart the game to use Steam co-op.');
  }
}

module.exports = { startSteam };
