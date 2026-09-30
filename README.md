# Dinosaur Island

A first-person, 1–4 player co-op dinosaur hunting demo. The authoritative world runs in Node.js; solo play uses the same simulation in the browser.

## Run and test

Requires Node.js 18 or newer.

```powershell
npm ci
npm start
```

Open `http://localhost:8080` for co-op, or select **Play solo (offline)** on the title screen. Other players can join the host's LAN IP and port through the server field. The HTTP and WebSocket server listens on port 8080 by default; `node server/index.js --port 9000` changes it.

```powershell
npm test
npm run desktop
npm run build:win
```

The Windows build is in `dist/win-unpacked/`. Keep the entire folder together when running or distributing it. The desktop app hosts a LAN co-op server on port 8080; set `DINO_DESKTOP_PORT` before launch to use another port.

## Game plan status

The web demo implements first-person movement, procedural dinosaur and player models, five dinosaur behaviors, spear/bow/trap/bait hunting, fruit, carried loot, hut storage, and 1–4 player WebSocket co-op. The server owns AI, damage, health, loot, inventory, and mission progress and checks movement and attack reports from clients.

The game is level based: every level is one oblong, randomly generated island (`src/shared/island.js`, biomes and difficulty in `src/shared/levels.js`). The team starts at the hut on the west beach. Three boat parts are hidden at random sites (a cave, the ruins, a dinosaur nest, the highest peak, under the waterfall, on the river bank or beside the lava flow). Players pick them up by walking over them, open the repair dialog at the wrecked boat on the east beach, and set sail together once everyone is aboard. The first island is a small jungle tutorial island; the second and last is a bigger, dark volcanic island with a lava flow and tougher dinosaurs. Sailing away from it wins the game, and a fresh first island starts. Mountains have a winding trail to the top (walking off-road is fine), caves are dug into hill flanks, the waterfall springs from a grotto in the cliff, and slopes too steep to walk can't be climbed by jumping. The mission board shows the boat parts as the main quest, with active contracts on the left and finished ones on the right.

Each fruit plant starts with 1–4 fruit and regrows a new random crop after it is picked clean. Fruit is found in the world, not on the map. Dinosaur map markers appear only after a player sees the animal; that discovery is shared with teammates and players who join later. The music shifts from a calm theme to a danger theme when hostile dinosaurs approach.

The Windows desktop folder build is ready for local testing. Steamworks setup, upload, store configuration, and testing on target player machines still require the project's Steam account and release process. The desktop build currently uses Electron's default executable icon and has no Steam lobby or overlay integration.


## Firearms and weapon preview

The weapon branch adds the MIT-licensed Claude-of-Duty P-19 pistol and M4A1 assault rifle models. Use 6 for the pistol, 7 for the rifle, left-click to fire (hold for the rifle), right-click to aim, and R to reload. Refill magazines and reserve ammunition at the hut workbench. The weapon workshop at `/src/client/player/weapon-preview.html` includes both firearms and visible spear throws with a reset control. Model provenance and the server validation limits are documented in `docs/weapon-presentation.md`; the upstream license is preserved in `src/client/models/firearms/reference/LICENSE`.
