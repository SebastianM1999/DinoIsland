# desktop
> Electron wrapper: runs the game server in a utility process that also owns the player's saved expeditions, opens a locked-down game window on it, keeps personal/device preferences in files, and bridges optional Steam co-op (lobbies, invites, P2P transport) to the renderer.

## Files
- `main.cjs` — Electron main process: single-instance lock (a second launch focuses this window and hands its `+connect_lobby` to Steam), forks `host-process.js` as an Electron `utilityProcess` and waits for its port, opens a sandboxed `BrowserWindow` on `http://127.0.0.1:<port>/` (`--demo` / `DINO_DEMO=1`: hosts the demo and opens `?demo=1`), installs Steam, picks the player identity (the Steam account in the Steam build, `local` otherwise; a Steam build without Steam gets no expeditions instead of an empty folder), sends the host its expedition folder (`userData/saves/profiles/<identity>/worlds`), serves the preference store over `dino:store:*` IPC, and on quit waits (at most 8 s) for the host's final save before stopping Steam and the host.
- `host-process.js` — the utility process: `createGameServer({ saves: true })` on `0.0.0.0` (port from `DINO_DESKTOP_PORT`, else random); messages with `main.cjs`: `ready`, `identity`/`identity-done`, `shutdown`/`shutdown-done`, `failed`, and the Steam bridge (`hostBridge.js`). World ticks and save captures run here, never on the main process (window, IPC, Steam pump).
- `hostBridge.js` — Steam players into the host process: `createRemoteHost(channel)` (main; looks like a game host to `SteamSession`: `attachConnection(peer, addr, info)`, `stop`, `dispose`) and `createBridgeEndpoint(host, post)` (host process; turns `conn-open` / `conn-msg` / `conn-close` into WebSocket-like sockets for `server/gameHost.js`, and their sends and closes back into `conn-send` / `conn-close`).
- `personal-store.cjs` — `PersonalStore`, `JsonFileStore`, `identityFolder`: preferences as small JSON files (`saves/device/settings.json` for this PC: settings, graphics calibration; `saves/profiles/<identity>/personal.json` for the player: name, outfit, pockets, tracked contract), debounced atomic writes with a `.bak`, validated keys/values, retired progression keys refused.
- `preload.cjs` — exposes `window.dinoSteam` (status, friends, lobbies, host, join, leave, invite, dismissInvite, send, onEvent) via `contextBridge`, forwarding to `dino:steam:*` IPC channels, and `window.dinoStore` (getItem/setItem/removeItem/keys over a snapshot read synchronously at start-up, writes sent to `dino:store:set`).
- `steam.cjs` — `installSteam(app, win, localUrl)`: loads the Steamworks SDK (`steamworks-ffi-node`) if an App ID and the runtime DLL are present, creates a `SteamSession`, pumps it every 4 ms, and registers the IPC handlers with a trusted-sender check. Takes `createHost` (main passes the bridge to the host process). Returns `{ stop, steamId, configured, handleArgs }` (`configured`: a real App ID is set; `steamId`: the signed-in account, validated).
- `steam-session.js` — `SteamSession` (ES module): carries the desktop demo flag into its authoritative host, enforces its two-player lobby cap, and keeps demo/full expeditions separate; hosts or joins a Steam lobby, wraps Steam P2P connections as WebSocket-like `Peer`s and attaches them to a `startGameHost()` game host (no HTTP server). Also exports `STEAM_PROTOCOL` and `validSteamId()`.
- `steam-config.json` — holds the Steam `appId` (currently `null`, which disables Steam co-op).

## Entry points
- `package.json` `main` points at `main.cjs`; `npm run desktop` runs `electron .`, `npm run build:win` / `build:steam` package it with electron-builder.
- `main.cjs` forks `host-process.js` (`utilityProcess.fork`) and calls `installSteam()` from `steam.cjs`; `steam.cjs` dynamically imports `steam-session.js`.
- `window.dinoStore` is read by `src/client/core/persistence.js` (all client preferences) and `src/client/net/expeditions.js` (its presence selects the host expedition backend).
- `SteamSession` calls its `createHost` when hosting: in the desktop app the remote host of `hostBridge.js`, so a Steam lobby plays the saved expedition open in the host process (`hostGame(visibility, ownerToken)`: the host's own renderer, a local in-memory `Peer`, joins with the expedition's owner token; remote peers are attached with their authenticated Steam identity, `{ steamId }`). The default, `startGameHost` from `server/gameHost.js`, is a session world (tests).
- `window.dinoSteam` is read by `src/client/main.js` (passed to `Net.steam`) and `src/client/ui/steamLobby.js`; `src/client/net/steamTransport.js` (`connectSteam`) drives it. `test/steam-coop.test.js` runs `SteamSession` and `connectSteam` together against a fake Steam.

## Rules
- The game window runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; navigation away from the local server URL is blocked, and new windows are denied except the local audio credits page. External links open in the system browser only for a fixed list of credit hosts over HTTPS.
- IPC handlers accept calls only from the main frame of the game window whose origin matches the local server (`trusted()` in `steam.cjs` and `main.cjs`). The renderer never gets native Steam APIs, file paths or arbitrary IPC channels.
- Save files: everything lives under `app.getPath('userData')/saves`, outside the install folder and outside Chromium's origin storage. Expeditions belong to the host process (`server/saveCoordinator.js`); main only tells it the folder. Never store progression in the page's localStorage: its origin includes the random port.
- Quitting goes through `before-quit`: the final save first (bounded), then Steam and the host. A crash or a killed process falls back to the last autosave.
- Without a valid App ID, the DLL (`steamworks_sdk/redistributable_bin/win64/steam_api64.dll`), or a running Steam, Steam stays disabled and `status` reports `{ available: false, reason }`; the game still runs (solo / LAN / internet test).
- Steam message limits: renderer-to-host and peer input messages are capped at 8192 bytes, host-to-client world messages at 512 KiB; only JSON objects are sent.
- Messages starting with `{"t":"snap"` or `{"t":"state"` go over Steam's unreliable channel (when available); everything else is reliable and ordered. This relies on `JSON.stringify` putting `t` first.
- Lobbies are tagged with `game = BRAND.slug`, `protocol = STEAM_PROTOCOL` (`<slug>-1`), `host` and `ready`; joins fail on a mismatching game/protocol or a host that is no longer owner/ready. Hosts admit only lobby members, no duplicates, at most `(demo ? CONFIG.demo.maxPlayers : CONFIG.net.maxPlayers) - 1` remote peers.
- Steam IDs are validated with `validSteamId()` (16-20 digit decimal string, at most 64-bit) before use.
- One operation at a time: a `generation` counter cancels stale host/join attempts; `leave()` tears down host, peers, connections, lobby and rich presence.

## Not here
- The WebSocket host, HTTP server and internet tunnel: `server/`.
- Game simulation: `src/sim/`. Network message formats: `src/shared/protocol.js`.
- Renderer-side Steam/LAN transport and join UI: `src/client/net/` (`steamTransport.js`, `net.js`, `lan.js`).
- Product name, slug and storage prefix: `src/shared/brand.js` and `package.json` `build.productName` (window titles read the latter).
- Steam build verification script: `scripts/verify-steam.cjs`.
