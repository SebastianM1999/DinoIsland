# src/client/net
> The client side of the network protocol: one `Net` session to an authoritative `ServerWorld`, whatever the transport (WebSocket, Steam bridge or solo Web Worker), plus clock sync, snapshot ordering and interpolation.

## Files
- `net.js` — `Net`: transports (`connect`, `steam`, `local`), handler registry, `send`/`act`/`sendState`, server clock estimate, adaptive interpolation delay, snapshot acceptance/ordering, profile receipt, telemetry.
- `interp.js` — `InterpBuffer`: time-stamped value frames for remote entities, interpolated between the two surrounding snapshots (angle-aware).
- `steamTransport.js` — `connectSteam`: adapts the Electron preload Steam bridge (`window.dinoSteam`) into a `Net` transport and waits for the welcome.
- `lan.js` — `websocketAddress` (normalises a typed IP/URL into a `ws://`/`wss://` address with the default port), `initLanAddress` (fills the host-address UI from the server's `/connection` endpoint, copy button).

## Entry points
- `Net.local(name, outfit, opts, profile)` — solo: starts `src/sim/worker.js` as a module Worker; messages are structured-cloned like a network. Called from `src/client/main.js`.
- `Net.connect(url, name, outfit, profile)` — online/LAN/internet over WebSocket (JSON); resolves on `WELCOME`, rejects on `REJECT`, timeout or error. Called from `main.js`.
- `Net.steam(bridge, options, name, outfit, profile)` — host or join a Steam lobby via `connectSteam`. Called from `main.js`.
- On the instance, `src/client/core/game.js` uses `on(MSG.* | 'ev:<EV>')`, `act(ACT.*, data)`, `sendState(fields)`, `renderNow()`, `stateProvider`, `clearHandlers()`; `player/actions.js` and `entities/projectiles.js` call `act`; `ui/perfStats.js` reads `rtt`/`telemetry` via the stats frame.
- `InterpBuffer` is used by `src/client/entities/dinoViews.js` and `src/client/entities/remotePlayers.js`.
- `websocketAddress` and `initLanAddress` are used by `src/client/main.js`.

## Rules
- Gameplay code never knows which transport is in use; all three produce the same message stream.
- Every movement update carries a sequence number `s` and the correction epoch `k` (set from `WELCOME`, `CORRECT`, and own `RESPAWN`/`REVIVED` events) so the server can drop reordered or pre-correction packets (`ServerWorld.onState`).
- `act()` bundles the current state (from `stateProvider`) with each action so an action never depends on an earlier unreliable movement packet.
- Snapshots are dropped when older than the last welcome, not newer than the last one, from another world epoch (`w`), or older than the latest reliable message; a snapshot that overtook reliable messages (`r` ahead) is held until they arrive.
- Remote entities are drawn at `renderNow()` = server time minus an interpolation delay that adapts to jitter between `CONFIG.net.interpDelayMin` and `interpDelayMax`; render time never runs backwards.
- A profile received in `MSG.PROF` is sanitised and saved here (`saveProfile`), except creative-mode profiles, which are never kept.
- A heartbeat ping every 2 s keeps RTT/clock estimates fresh.
- Lag compensation input: clients send `rt` (their render time) with hits; the server clamps and uses it (`src/sim/world.js` `hitPose`).

## Not here
- Server-side hosting and the WebSocket server: `server/gameHost.js`, `server/index.js`.
- Steam SDK and lobby IPC: `desktop/` (the client only sees the preload bridge); lobby UI in `src/client/ui/steamLobby.js`.
- Message type constants and authority model: `src/shared/protocol.js`.
- Applying snapshots and events to the scene: `src/client/core/game.js` and `src/client/entities/`.
