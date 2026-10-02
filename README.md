# Dinosaur Island

A first-person, 1–4 player co-op dinosaur hunting demo. The authoritative world runs in Node.js; solo play uses the same simulation in the browser.

## Run and test

Requires Node.js 22 or newer.

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

The Windows build is in `dist/win-unpacked/`. Keep the entire folder together when running or distributing it. The desktop app chooses an available LAN port; expand **LAN / direct connection** to see it in the server address. Set `DINO_DESKTOP_PORT` before launch to use a fixed port. Browser builds use port 8080 by default.

Steam desktop co-op has **Host game**, **Join friend**, public lobby browsing, and **Invite friends** in the pause menu. Configure the game's App ID and add the SDK runtime before building for Steam; see [Steam setup and release checks](docs/steam-coop.md). Builds without Steam configuration show the reason and keep solo/LAN available.

For remote friend tests before Steam setup, click **Host internet test**. The Windows host downloads a verified Cloudflare tunnel helper on first use, starts a temporary relay, and shows a `wss://` address with a copy button. Share the whole address; friends paste it into **Friend’s internet address** and click **Join internet test** in their own copy of the game. The pause menu also has the address/copy button. No router changes are needed. Leaving or closing the host stops the tunnel. This uses Cloudflare's temporary test service; it is separate from the Steam release networking.

## Game plan status

The web demo implements first-person movement, procedural dinosaur and player models, five dinosaur behaviors, spear/bow/trap/bait hunting, fruit, carried loot, hut storage, and 1–4 player WebSocket co-op. The server owns AI, damage, health, loot, inventory, and mission progress and checks movement and attack reports from clients.

The game is level based: every level is one oblong, randomly generated island (`src/shared/island.js`, biomes and difficulty in `src/shared/levels.js`). The team starts at the hut on the west beach. Three boat parts are hidden at random sites (a cave, the ruins, a dinosaur nest, the highest peak, under the waterfall, on the river bank or beside the lava flow). Players pick them up by walking over them, open the repair dialog at the wrecked boat on the east beach, and set sail together once everyone is aboard. The first island is a small jungle tutorial island; the second and last is a bigger, dark volcanic island with a lava flow and tougher dinosaurs. Sailing away from it wins the game, and a fresh first island starts. Mountains have a winding trail to the top (walking off-road is fine), caves are dug into hill flanks, the waterfall springs from a grotto in the cliff, and slopes too steep to walk can't be climbed by jumping. The mission board shows the boat parts as the main quest, with active contracts on the left and finished ones on the right.

Each fruit plant starts with 1–4 fruit and regrows a new random crop after it is picked clean. Fruit is found in the world, not on the map. Dinosaur map markers appear only after a player sees the animal; that discovery is shared with teammates and players who join later. The music shifts from a calm theme to a danger theme when hostile dinosaurs approach.

The Windows desktop folder build is ready for local testing. Steam upload, store configuration, and two-account internet testing still require the project's Steam account and release process. The co-op UI uses in-game friend selection and Steam lobby invites, without depending on Electron's Steam overlay rendering.


## Firearms and weapon preview

The weapon branch adds the MIT-licensed Claude-of-Duty P-19 pistol and M4A1 assault rifle models. Use 6 for the pistol, 7 for the rifle, left-click to fire (hold for the rifle), right-click to aim, and R to reload. Refill magazines and reserve ammunition at the hut workbench. The weapon workshop at `/src/client/player/weapon-preview.html` includes both firearms and visible spear throws with a reset control. Model provenance and the server validation limits are documented in `docs/weapon-presentation.md`; the upstream license is preserved in `src/client/models/firearms/reference/LICENSE`.
