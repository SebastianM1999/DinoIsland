# src/client/net
> The client side of the network protocol: one `Net` session to an authoritative `ServerWorld`, whatever the transport (WebSocket, Steam bridge or solo Web Worker), plus clock sync, snapshot ordering and interpolation.

## Files
- `net.js` — `Net`: transports (`connect`, `steam`, `local`), handler registry, `send`/`act`/`sendState`, server clock estimate, adaptive interpolation delay, snapshot acceptance/ordering, profile receipt, telemetry; `beginLoading`/`endLoading` preserve reliable world changes and the latest valid snapshot during cooperative client construction.
- `interp.js` — `InterpBuffer`: time-stamped value frames for remote entities, interpolated between the two surrounding snapshots (angle-aware).
- `steamTransport.js` — `connectSteam`: adapts the Electron preload Steam bridge (`window.dinoSteam`) into a `Net` transport and waits for the welcome.
- `expeditions.js` — the player's saved expeditions from the page: `hostExpeditions` (desktop: the host process's `/saves` API, then `Net.connect` with the owner token, or with `steam` `Net.steam` hosting a lobby that feeds the expedition; `lobby` private = solo, open = Steam friends), `browserExpeditions` + `BrowserExpeditionStore` (IndexedDB records `{ id, current, previous }`, the solo worker's captures sealed with `shared/saveSchema.js`, export/import as files), `pickExpeditions()`. Same interface: `status`, `list`, `start(choice, player)` -> `Net` with `net.expedition`, `rename`, `remove`, `saveAndQuit`.

## Entry points
- `Net.local(name, outfit, opts, save)` — solo: starts `src/sim/worker.js` as a module Worker; messages are structured-cloned like a network. `save` (a world section, or `{}` for a new expedition) makes it a saved expedition: captures arrive at `net.onSaveCapture`, `net.captureSave()` asks for one. Called from `src/client/main.js` (testing sessions) and `expeditions.js`.
- Every `hello` (`Net.connect`, `Net.steam`) carries `v: PROTOCOL_VERSION` (`shared/protocol.js`); a host of another version answers with `REJECT` and a reason saying who has to update.
- `Net.connect(url, name, outfit)` — a WebSocket host (JSON): the desktop window to its own host process (`expeditions.js`), tests; resolves on `WELCOME`, rejects on `REJECT`, timeout or error. A saved expedition's `IDENT` is answered with this player's credential for it (`core/persistence.js` `guestCredential`); a `CREDENTIAL` is kept (`rememberGuestCredential`). Called from `expeditions.js`. After the welcome, a `REJECT` is the host's reason for ending the session (removed by the host): `net.onClose` receives it instead of the transport's generic disconnect text. `net.inLobby` / `net.lobbyMembers` / `net.lastWelcome` follow the lobby (welcome `lobby`, `EV.LOBBY`) even before a screen listens; the welcome that ends the lobby restarts the server-clock estimate (the island clock stood still). `net.off(type, fn)` removes a handler.
- `Net.steam(bridge, options, name, outfit)` — host or join a Steam lobby via `connectSteam`. Called from `main.js`.
- `net.onSave(fn)` / `net.saveStatus` / `net.reportSave(status)`: expedition save results (the host's `EV.SAVED`, or the browser store); read by `core/game.js` (failure toast) and `main.js` (pause menu).
- On the instance, `src/client/core/game.js` uses `on(MSG.* | 'ev:<EV>')`, `act(ACT.*, data)`, `sendState(fields)`, `renderNow()`, `stateProvider`, `clearHandlers()`; `player/actions.js` and `entities/projectiles.js` call `act`; `ui/perfStats.js` reads `rtt`/`telemetry` via the stats frame.
- `InterpBuffer` is used by `src/client/entities/dinoViews.js` and `src/client/entities/remotePlayers.js`.
- `websocketAddress` and `initLanAddress` are used by `src/client/main.js`.

## Rules
- Gameplay code never knows which transport is in use; all three produce the same message stream.
- Every movement update carries a sequence number `s` and the correction epoch `k` (set from `WELCOME`, `CORRECT`, and own `RESPAWN`/`REVIVED` events) so the server can drop reordered or pre-correction packets (`ServerWorld.onState`).
- `act()` bundles the current state (from `stateProvider`) with each action so an action never depends on an earlier unreliable movement packet.
- Snapshots are dropped when older than the last welcome, not newer than the last one, from another world epoch (`w`), or older than the latest reliable message; a snapshot that overtook reliable messages (`r` ahead) is held until they arrive.
- Remote entities are drawn at `renderNow()` = server time minus an interpolation delay that adapts to jitter between `CONFIG.net.interpDelayMin` and `interpDelayMax`; render time never runs backwards.
- A profile received in `MSG.PROF` is sanitised and kept on the session (`net.prof`), except creative-mode profiles, which are never kept. It belongs to the expedition: the client never stores it or sends it in `hello`.
- Expedition saves are never written by gameplay code: the host (desktop) or `expeditions.js` (browser) stores them; a save is only shown as done after the store confirmed it.
- A heartbeat ping every 2 s keeps RTT/clock estimates fresh.
- Call `beginLoading()` before asynchronous launch work and `endLoading()` only after every Game callback is registered. Metadata, clock sync and profile receipt remain live; reliable deliveries replay in arrival order before the latest still-current snapshot. The queue is bounded by message count and serialized bytes; overflow or a replacement welcome during construction disconnects explicitly rather than silently applying incomplete/wrong-island state.
- Lag compensation input: clients send `rt` (their render time) with hits; the server clamps and uses it (`src/sim/world.js` `hitPose`).

## Not here
- Server-side hosting and the WebSocket server: `server/gameHost.js`, `server/index.js`.
- Steam SDK and lobby IPC: `desktop/` (the client only sees the preload bridge); lobby UI in `src/client/ui/steamLobby.js`.
- Message type constants and authority model: `src/shared/protocol.js`.
- Applying snapshots and events to the scene: `src/client/core/game.js` and `src/client/entities/`.
