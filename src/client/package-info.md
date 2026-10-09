# src/client
> The browser/Electron game client: menu and lobby flow, Three.js rendering of the island, local player prediction, input, HUD/UI, audio and the connection to the authoritative world.

## Files
- `main.js` — entry point loaded by `index.html`: menu/lobby, starting a session in the chosen mode, building a `Game` per island, live left-aligned expedition menu with keyboard navigation, leave/back-to-menu.
- `core/` — `Game` shell (main loop, wiring of all subsystems), renderer, graphics auto-tier, settings, saved profile, resource disposal.
- `net/` — `Net` session over WebSocket, Steam bridge or the solo Web Worker; clock sync, snapshot ordering, interpolation buffer, LAN address helpers.
- `input/` — `Input`: keyboard/mouse to named actions, pointer lock.
- `player/` — local player: movement controller (prediction), actions (tools, combat, interactions), first-person viewmodel, stuck detection, spear-throw contract, weapon workshop page.
- `entities/` — views of server-owned objects: dinosaurs (`dinoViews.js`), remote players, items, projectiles, tracks, relics (boat parts), gun effects.
- `models/` — procedural and GLB models: dinosaurs (`models/dino/`), explorer, weapons, firearms, hands, fruit, props, model kit.
- `world/` — static island visuals built from the shared layout: terrain mesh, sky, water/lava, vegetation, rocks, fruit plants, hut, base, sites (boat wreck, caves, ruins), grove barrier, boss arena, logs.
- `ui/` — HUD, minimap, menus/settings, panels (crafting, base, boat, skills, wardrobe, grove prompt), Steam lobby, internet test, perf stats, HUD preview page.
- `audio/` — Web Audio effects and music, sample catalog, footstep surfaces/cadence, boss-music region.

## Entry points
- `main.js` runs on page load (`<script type="module" src="src/client/main.js">` in `index.html`). Flow:
  1. Menu: left-aligned player identity and solo/create/join actions. `ui/homeMenu.js` groups connection routes into dedicated dialogs plus how-to-play/credits; `ui/homeExplorer.js` shows saved progression and opens the existing outfit picker. Name saves while typing; outfit and profile carry into the next expedition. Lobby polling of `/status`, menu music on first gesture, `initSteamLobby`, `initLanAddress`, `initInternetTest`. Dynamically loads `ui/menuTour.js` after paint for a photograph tour of the three seeded islands, preloads/decodes all nine images, and moves the selected solo island into the right-side lookout; stops the tour and closes home dialogs before gameplay starts and restarts it if launch fails. `css/menu.css` styles the home screen and its dialogs.
  2. `start(mode)` opens a `Net`: `Net.local` (solo worker, starting from the selected island; temporary playtest access bypasses earned locks, with `?island=`, `?base=`, `?raid=` explicit testing aids), `Net.connect` (online, LAN, internet via `internetTest`), or `Net.steam` (`window.dinoSteam` bridge). Sends the saved outfit (`ui/wardrobe.js`) and profile (`core/profile.js`). The home skill tree edits a draft of earned points and persists only on Save build; XP/bonus remain unchanged. Completed host mission events unlock the next starting island locally unless creative mode is active; multiplayer starts on its host's island. Previews never unlock play.
  3. `launch(net)`: loading screen, `preloadDinoModels`, `new Game(canvas, net, reuse)`, `game.gfx.prepare()` (shader precompile), `game.start()`, pointer lock.
  4. On `game.onNewIsland(welcome)` (team set sail) the old game is `dispose()`d and `launch` runs again, reusing renderer, audio and input; creative mode is carried over.
  5. Leaving or a disconnect calls `backToMenu`, which reloads the page with the reason in the URL hash.
- `core/game.js` (and everything only it imports) is loaded with a dynamic `import()` from `main.js`: prefetched when the browser is idle after the menu is up, and awaited in `launch()`. Keep new static imports of game-only modules out of `main.js`, `ui/menus.js`, `ui/wardrobe.js` and the other menu modules, or they end up on the menu's critical path (the server preloads the static graph).
- `?debug` exposes the running game as `window.dinoGame`; `window.__game` is always set.

## Rules
- Client code imports from `src/shared/` and other `src/client/` folders, never from `src/sim/` or `server/`. The one link to the sim is the Worker URL `../../sim/worker.js` in `net/net.js` (solo play), which runs in its own thread.
- The client is not authoritative: gameplay effects are requests (`net.act(ACT.*)`) and movement updates (`net.sendState`); the server answers with snapshots, events and corrections.
- The island is rebuilt locally from `welcome.world.level` (`index`, `variant`) with the same shared `planIsland` / `buildLayout` the server uses; it is never streamed.
- A `Game` instance lives for exactly one island; anything island-specific must be released in `Game.dispose()`.
- Persistent client data uses `localStorage` keys from `storageKey()` (`shared/brand.js`) and is wrapped in try/catch because storage may be blocked.

## Not here
- Simulation, AI, validation, missions and raids: `src/sim/`.
- Data/rules shared with the sim (config, protocol, terrain, layout, collision, skills, crafting): `src/shared/`.
- Node WebSocket server and hosting: `server/`; Electron shell and Steam SDK: `desktop/`.
- Page markup and styles: `index.html`, `css/`.
