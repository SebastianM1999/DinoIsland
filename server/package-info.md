# server
> Node host process: serves the web client over HTTP and runs the authoritative `ServerWorld` (src/sim/world.js) for co-op players over WebSocket.

## Files
- `staticFiles.js` — `serveStatic()`: ETag/304, brotli/gzip for text files (compressed once per file version and kept in memory), one-day caching for `/vendor/three/` and the font, and the `<link rel="modulepreload">` hints injected into `index.html` from the static import graph of its module entry (`staticImportGraph()` follows the import map for `three`).
- `index.js` — HTTP static file server plus local control endpoints (`/connection`, `/status`, `/internet*`); `createGameServer()` wires the game host and the internet relay onto one `http.Server`. Also runnable as a CLI (`node server/index.js [--port N]`).
- `gameHost.js` — `startGameHost()`: WebSocket connection handling, `hello` join/reject, message routing into `ServerWorld`, fixed-rate tick loop, snapshot broadcast and silent-client timeout.
- `internetHost.js` — `InternetHost`: development-only remote friend test. Downloads a pinned, SHA-256-checked `cloudflared` (Windows x64 only), opens a Quick Tunnel to a local proxy that admits only WebSocket upgrades carrying a random room token.
- `lanAddress.js` — `lanAddresses(port)`: lists shareable `ws://<ipv4>:<port>` addresses, physical adapters before VM/VPN ones, de-duplicated.

## Entry points
- `createGameServer()` (index.js) — called by `desktop/main.cjs` (Electron launcher) and by tests (`test/http-host.test.js`, `test/internet-host.test.js`, `test/lan-address.test.js`, `test/audio.test.js`). Returns `{ httpServer, host, internet }`; the caller decides the port and calls `listen`.
- `startGameHost(httpServer?, { onConnection })` (gameHost.js) — called by `index.js` and by `desktop/steam-session.js`, which passes no HTTP server and feeds Steam peers through the returned `attachConnection(ws, addr)`. The returned object also has `world`, `stop()` and `status()`.
- `InternetHost` — constructed in `index.js`; its constructor takes injectable `getHelper`/`spawnProcess`/`resolveAddress` (used by `test/internet-host.test.js`).
- `npm start` / `npm run dev` run `server/index.js` directly.

## Rules
- The server only hosts; all gameplay rules live in `ServerWorld`. `gameHost.js` must not interpret game messages beyond `hello` (join) — everything else goes to `world.receive(playerId, msg)`.
- Incoming messages are capped at 8 KiB (`MAX_MSG_BYTES`, also the `ws` `maxPayload`); oversized messages close the socket, malformed JSON / non-object messages are ignored.
- Every outgoing message gets a per-recipient reliable sequence number `r`; non-snapshot messages increment it, snapshots (`MSG.SNAP`) carry the current value without incrementing. Snapshots are skipped for a socket whose `bufferedAmount` exceeds 64 KiB; reliable messages are never skipped.
- The world steps at `CONFIG.net.tickRate` with an accumulator (catch-up capped at 250 ms); snapshots go out only when `world.snapshotDue()` says so. Players silent for longer than `CONFIG.net.timeoutMs` are terminated and removed.
- Static responses go through `staticFiles.js`; everything revalidates (`no-cache` + ETag) except the vendored Three.js and the font. Dynamic `import()` targets (the game module graph) are deliberately not preloaded.
- Only `src/`, `css/`, `assets/` and `index.html` are served; `/vendor/three/` maps into `node_modules/three` (or a packaged `three-addons` folder). Every resolved path is checked to stay inside its root.
- `/internet/start` and `/internet/stop` require a loopback client, `POST`, `application/json` and a localhost `Origin` on the server's own port; `/internet` (status) requires loopback only.
- The internet tunnel exposes only WebSocket gameplay: the proxy answers plain HTTP with 404 and rejects upgrades without the room token. The tunnel stops when the owner's local socket (`?internetOwner=<token>`) closes.
- Uses `ws` and Node built-ins only; shared data comes from `src/shared/` (`config.js`, `protocol.js`, `brand.js`).

## Not here
- Game rules, AI, inventory, missions, snapshots: `src/sim/` (`world.js` and friends).
- Message formats and tunables: `src/shared/protocol.js`, `src/shared/config.js`.
- Solo play does not use this server: it runs `ServerWorld` in a Web Worker (`src/sim/worker.js`, started from `src/client/net/net.js`).
- Steam lobbies and P2P transport: `desktop/steam-session.js` (it reuses `startGameHost`).
- Client-side networking and join UI: `src/client/net/`.
