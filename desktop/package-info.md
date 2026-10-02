# desktop
> Electron wrapper: starts the game server in-process, opens a locked-down game window on it, and bridges optional Steam co-op (lobbies, invites, P2P transport) to the renderer.

## Files
- `main.cjs` — Electron main process: imports `createGameServer()` from `server/index.js`, listens on `0.0.0.0` (port from `DINO_DESKTOP_PORT`, else random), opens a sandboxed `BrowserWindow` on `http://127.0.0.1:<port>/`, installs Steam, and stops everything on quit.
- `preload.cjs` — exposes `window.dinoSteam` (status, friends, lobbies, host, join, leave, invite, dismissInvite, send, onEvent) via `contextBridge`, forwarding to `dino:steam:*` IPC channels.
- `steam.cjs` — `installSteam(app, win, localUrl)`: loads the Steamworks SDK (`steamworks-ffi-node`) if an App ID and the runtime DLL are present, creates a `SteamSession`, pumps it every 4 ms, and registers the IPC handlers with a trusted-sender check. Returns a cleanup function.
- `steam-session.js` — `SteamSession` (ES module): hosts or joins a Steam lobby, wraps Steam P2P connections as WebSocket-like `Peer`s and attaches them to a `startGameHost()` game host (no HTTP server). Also exports `STEAM_PROTOCOL` and `validSteamId()`.
- `steam-config.json` — holds the Steam `appId` (currently `null`, which disables Steam co-op).

## Entry points
- `package.json` `main` points at `main.cjs`; `npm run desktop` runs `electron .`, `npm run build:win` / `build:steam` package it with electron-builder.
- `main.cjs` calls `installSteam()` from `steam.cjs`; `steam.cjs` dynamically imports `steam-session.js`.
- `SteamSession` calls `startGameHost` from `server/gameHost.js` when hosting; the host's own renderer is attached as a local in-memory `Peer`.
- `window.dinoSteam` is read by `src/client/main.js` (passed to `Net.steam`) and `src/client/ui/steamLobby.js`; `src/client/net/steamTransport.js` (`connectSteam`) drives it. `test/steam-coop.test.js` runs `SteamSession` and `connectSteam` together against a fake Steam.

## Rules
- The game window runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; navigation away from the local server URL is blocked, and new windows are denied except the local audio credits page. External links open in the system browser only for a fixed list of credit hosts over HTTPS.
- IPC handlers accept calls only from the main frame of the game window whose origin matches the local server (`trusted()` in `steam.cjs`). The renderer never gets native Steam APIs or arbitrary IPC channels.
- Without a valid App ID, the DLL (`steamworks_sdk/redistributable_bin/win64/steam_api64.dll`), or a running Steam, Steam stays disabled and `status` reports `{ available: false, reason }`; the game still runs (solo / LAN / internet test).
- Steam message limits: renderer-to-host and peer input messages are capped at 8192 bytes, host-to-client world messages at 512 KiB; only JSON objects are sent.
- Messages starting with `{"t":"snap"` or `{"t":"state"` go over Steam's unreliable channel (when available); everything else is reliable and ordered. This relies on `JSON.stringify` putting `t` first.
- Lobbies are tagged with `game = BRAND.slug`, `protocol = STEAM_PROTOCOL` (`<slug>-1`), `host` and `ready`; joins fail on a mismatching game/protocol or a host that is no longer owner/ready. Hosts admit only lobby members, no duplicates, at most `CONFIG.net.maxPlayers - 1` remote peers.
- Steam IDs are validated with `validSteamId()` (16-20 digit decimal string, at most 64-bit) before use.
- One operation at a time: a `generation` counter cancels stale host/join attempts; `leave()` tears down host, peers, connections, lobby and rich presence.

## Not here
- The WebSocket host, HTTP server and internet tunnel: `server/`.
- Game simulation: `src/sim/`. Network message formats: `src/shared/protocol.js`.
- Renderer-side Steam/LAN transport and join UI: `src/client/net/` (`steamTransport.js`, `net.js`, `lan.js`).
- Product name, slug and storage prefix: `src/shared/brand.js` and `package.json` `build.productName` (window titles read the latter).
- Steam build verification script: `scripts/verify-steam.cjs`.
