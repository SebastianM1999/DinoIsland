# src/client
> The browser/Electron game client: menu and lobby flow, Three.js rendering of the island, local player prediction, input, HUD/UI, audio and the connection to the authoritative world.

## Files
- `main.js` — entry point loaded by `index.html`: menu/lobby (the demo: `?demo=1` or a demo server's `/status` – `applyDemoMenu` keeps island 1, hides the skill tree and levels via `body.is-demo`, solo starts the demo), starting a session in the chosen mode, building a `Game` per island, live left-aligned expedition menu with keyboard navigation, leave/back-to-menu.
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
  1. Menu: left-aligned player identity and solo/create/join actions. `ui/homeMenu.js` groups connection routes into dedicated dialogs plus how-to-play/credits; `ui/homeExplorer.js` explains that level/skills belong to each expedition and opens the existing outfit picker; `ui/expeditionPanel.js` lists the saved expeditions. Name saves while typing; name and outfit carry into every expedition (preferences: `core/persistence.js`). Lobby polling of `/status`, menu music on first gesture, `initSteamLobby`, `initLanAddress`, `initInternetTest`. The backdrop is a photograph slideshow only (`ui/menuPostcards.js`, loaded after paint): no WebGL renderer and no map models are built or loaded for the menu, only the selected island's WebP photographs are decoded. The right-hand Next island button and solo island selection work immediately; the slideshow stops before connecting/starting the solo worker and restarts if launch fails. `css/menu.css` styles the home screen and its dialogs.
  2. Play solo opens the expedition picker (`ui/expeditionPanel.js`); on the desktop, Host LAN game / internet game open it too, to choose which expedition to host. `start('expedition', { choice, purpose })` goes through `net/expeditions.js` (desktop: open on the host process, then `Net.connect` with the owner token; browser: `Net.local` with the saved world, captures stored in IndexedDB). A new expedition starts on the selected island (temporary playtest access) or island 1. Testing aids (`?island=`, `?variant=`, `?base=`, `?raid=`, `?dev`, `?pin`) start an unsaved `Net.local` session straight away. `Net.connect` (joining online, LAN, internet; hosting from a browser page) and `Net.steam` (`window.dinoSteam` bridge; Steam-hosted sessions are not saved yet) are unchanged. Sends the saved outfit (`ui/wardrobe.js`); XP, skills and island progress belong to the expedition (the home skill tree only browses). Multiplayer starts on its host's island.
  3. `launch(net)`: the cached map photographs with CSS drift, playful captions plus real loading stages (also shown while connecting), `preloadDinoModels`, `new Game(canvas, net, reuse)`, `game.gfx.prepare()` (shader precompile), `game.start()`, pointer lock for new expeditions; joining opens the expedition menu with players and quests visible.
  4. On `game.onNewIsland(welcome)` (team set sail) the old game is `dispose()`d and `launch` runs again, reusing renderer, audio and input; creative mode is carried over.
  5. Leaving or a disconnect calls `backToMenu`, which reloads the page with the reason in the URL hash. In a saved expedition the leave button is Save & quit: it waits for the save (`expeditions.saveAndQuit`) and, when that fails, stays in the game and offers Quit without saving. The pause card shows when the expedition was last saved (`#pause-save`).
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
