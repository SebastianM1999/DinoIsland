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

The web demo implements the island, first-person movement, procedural dinosaur and player models, five dinosaur behaviors, spear/bow/trap/bait hunting, fruit, carried loot, hut storage, the Brachiosaurus expedition, and 1–4 player WebSocket co-op. The server owns AI, damage, health, loot, inventory, and mission progress and checks movement and attack reports from clients.

Each fruit plant starts with 1–4 fruit and regrows a new random crop after it is picked clean. Fruit is found in the world, not on the map. Dinosaur map markers appear only after a player sees the animal; that discovery is shared with teammates and players who join later. The music shifts from a calm theme to a danger theme when hostile dinosaurs approach.

The Windows desktop folder build is ready for local testing. Steamworks setup, upload, store configuration, and testing on target player machines still require the project's Steam account and release process. The desktop build currently uses Electron's default executable icon and has no Steam lobby or overlay integration.
