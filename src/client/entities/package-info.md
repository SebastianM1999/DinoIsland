# entities
> Client-side views of server-owned things in the world (dinosaurs, other players, loot, traps, relics, tracks, projectiles, shot tracers), driven by snapshots and events from `client/net`.

## Files
- `dinoViews.js` — `SPECIES` table and `DinoView`/`DinoViews`: interpolated, animated dinosaurs with hit spheres, health bars, spotting, raycast and minimap markers.
- `sarcoEffects.js` — server-triggered water ambush warning eye glints, silt burst and swimming wakes.
- `gunEffects.js` — `GunEffects`: short-lived bullet tracer lines plus the shot sound, from `EV.SHOT` events.
- `items.js` — `Items`: loot, dropped/lodged arrows and spears, firearms, fruit and traps on the ground (`EV.ITEM_*`, `EV.TRAP_*`); keeps one hidden copy of every loot model so the renderer's warm-up frame compiles and uploads them before the first drop.
- `projectiles.js` — `Projectiles`: arrows and thrown spears in flight; own shots simulated locally, remote shots replayed from `EV.FIRE`.
- `relics.js` — `Relics`: glowing boat-part pickups, removed when the server reports them found.
- `remotePlayers.js` — `RemotePlayers`: other co-op players, interpolated, with nameplates, outfits and equipment.
- `tracks.js` — `Tracks`: instanced, fading dinosaur footprint decals from `EV.TRACK` events; nearest-track query and minimap markers.

## Entry points
- `core/game.js` constructs `DinoViews`, `Tracks`, `Items`, `Projectiles`, `Relics` (each takes `game`) and `RemotePlayers(scene, camera, overlay)`; most are updated each frame through `game.systems`, and receive the world state via `onWelcome(world)` / `onSnapshot`.
- `GunEffects` is created by `player/actions.js` and `player/weapon-preview.js`.
- `SPECIES` is also read by `models/dino/preview.html` and by tests (`test/dino-glb.test.js`, `test/dino-visibility.test.js`).
- `DinoViews.raycast()`, `nearest()`, `minimapMarkers()` and `Tracks.nearest()/minimapMarkers()` serve aiming, tracking hints and the HUD minimap.

## Rules
- These classes render server state. They subscribe to `game.net.on('ev:…')` events and snapshot rows; they never decide game outcomes (spawning, damage, pickups, relic finds) themselves.
- Exceptions that report to the server instead of deciding: `Projectiles` simulates the local player's own arrows/spears and sends `ACT.FIRE` / `ACT.LAND` (with the hit dino, zone and render time); `DinoViews.spotVisibleDinosaurs()` sends `ACT.SPOT`. Remote projectiles are visual only.
- Collision and visibility math comes from `shared/` (`collision.js`, `visibility.js`, `grove.js`) so client hit tests agree with the sim.
- Every server dino type needs an entry in `SPECIES`. Each entry first tries the GLB model (`buildGLBDino`) and falls back to the procedural builder; per-species `extraUpdate` runs only for procedural rigs.
- Boss attack phases carry authoritative start time, duration and sequence; clip sampling uses the interpolated server render clock, including late joins and low FPS.
- Positions come from `net/interp.js` `InterpBuffer` sampled at render time, not from raw latest rows.
- Cached geometries/materials shared across islands are marked with `retainResource` (`core/resources.js`); `DinoView.dispose()` uses `disposeIslandScenes`, which skips retained resources. Keep new caches retained or they get disposed on island change.
- Models come from `client/models/`; this directory only places, animates and disposes them.

## Not here
- Mesh/rig construction: `client/models/` (dinos in `models/dino/`, weapons in `models/weapons.js`, firearms in `models/firearms/`, relic models in `models/props/relics.js`).
- The local player, first-person viewmodel and input actions: `client/player/`.
- Static island scenery (terrain, trees, hut, base, sites): `client/world/`.
- Network transport and interpolation buffers: `client/net/`.
- Authoritative dino AI, damage, loot and traps: `src/sim/`; shared rules and constants: `src/shared/`.
