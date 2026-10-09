# Dinosaur Island (system)
> A 1-4 player co-op first-person dinosaur hunt: one authoritative world simulation, shared deterministic rules, and a Three.js client, hosted by Node, Electron/Steam or an in-browser Web Worker.

## Components
Split by where code runs, not by feature. Allowed imports (checked; keep it this way):

```
server/  ──▶ src/sim/world.js, src/shared/
desktop/ ──▶ server/ (gameHost, index), runs the game window
src/sim/    ──▶ src/shared/            (never client/, never server/)
src/client/ ──▶ src/shared/            (never sim/ by import; solo play starts sim/worker.js by Worker URL)
src/shared/ ──▶ src/shared/ only       (no DOM, no three, no Math.random, no clock)
```

- `src/shared/`: pure data and rules both sides must agree on (island plan, layout, colliders, catalogs, protocol, config). See `shared/package-info.md`.
- `src/sim/`: the authoritative `ServerWorld` with dino AI, validation, missions and the base. See `sim/package-info.md`.
- `src/client/`: menus, rendering, prediction, UI and audio. `client/core/game.js` wires all of it together. See `client/package-info.md`.
- `server/`, `desktop/`: hosts. See their `package-info.md`.

## Hosting
- **Solo:** `Net.local` (`client/net/net.js`) starts `sim/worker.js` as a Web Worker, so the same `ServerWorld` runs off the render thread.
- **LAN / online:** `server/gameHost.js` runs `ServerWorld` and talks WebSocket. The Electron app (`desktop/main.cjs`) starts that server in its own process.
- **Steam:** `desktop/steam*.cjs/js` + `client/net/steamTransport.js` carry the same protocol over Steam P2P.

## Authority model (details at the top of `shared/protocol.js`)
- The server owns dinosaurs, items, fruit, traps, health, inventories, missions, the hut store and the base.
- Clients own only their own movement and send it about 20 times a second. They report hits; the server checks the hits against the dinos' past poses (lag compensation, `CONFIG.net.lagCompMax`).
- The island layout is deterministic from (level, variant seed), so client and server build the same world. Every island is a fixed map: its variant comes from `shared/levels.js` (`?variant=N` overrides it for testing). Sim spawns and AI use `Math.random` and are **not** deterministic.

## Feature map
Where each feature lives in each layer. Paths are relative to `src/` unless they start with `test/`, `server/` or `desktop/`.

| Feature | shared | sim | client | tests |
|---|---|---|---|---|
| Island gen, terrain, layout | island.js, terrain.js, layout.js, levels.js, rng.js | world.js (`#loadLevel`) | world/terrainMesh.js, sky.js, vegetation.js, veg/, rocks.js, logs.js, sites.js | map-rules, levels, traversal |
| Collision, movement | collision.js, siteFrame.js, *Shape.js | world.js (`onState`), unstuck.js | player/controller.js, player/stuck.js | movement, traversal, spring-collision |
| Netcode, lag comp | protocol.js, config.js (net) | world.js (`receive`, `hitPose`), dinos.js (pose history), hitCheck.js | net/net.js, net/interp.js | netcode, ordering, world-authority |
| Dinos (all) | dinoContact.js | dinos.js, pathfind.js, ai/*.js | entities/dinoViews.js, models/dino/ | dino-visibility, dino-glb, dino-skin, dino-slopes, dino-contact |
| Gloom raptor (cave packs of the future Hollow Mountain level; hunts by noise, spawns only at `layout.caveDinoSpots`) | config.js (`dinos['gloom-raptor']`), protocol.js | ai/gloomRaptor.js (+ `packHunterBrain` in ai/raptor.js), firearms.js/world.js (`player.lastShotAt`) | entities/dinoViews.js, models/dino/glbCatalog.js, audio/audio.js | gloom-raptor, dino-glb |
| Sump lurker (cave ambusher in flooded tunnels; spawns only at flooded `layout.caveDinoSpots`) | config.js (`dinos['sump-lurker']`, `aquatic` flag), protocol.js | ai/sumpLurker.js, ai/aquatic.js (shared with the sarcosuchus), dinos.js (swimming/carcass via `aquatic`) | models/dino/sumpModel.js, glbCatalog.js, sarcoFallback.js, entities/sarcoEffects.js, audio/audio.js | sump-lurker, dino-glb, sarcosuchus-boss |
| Crystal plodder (cave herbivore, glowing crystals; one per big hall, never beside a gloom pack) | config.js (`dinos['crystal-plodder']`), protocol.js, caveDinos.js (`plodderChambers`, one place that picks the halls) | ai/crystalPlodder.js, ai/territorial.js (tail sweep + graze loop shared with the stego), ai/gloomRaptor.js (skips plodder halls) | models/dino/glbCatalog.js + glbDino.js (`glow`: unlit crystal material), crystalPlodder.js (fallback), entities/dinoViews.js, audio/audio.js | crystal-plodder, dino-glb, cave-level |
| Raptor / stego / trex / ptera / brachio | | ai/raptor.js, stego.js, trex.js, ptera.js, brachio.js | models/dino/ (GLB + procedural fallback) | raptor-fear, stego-tail, ptera-flight, grove |
| Alpha Sarcosuchus (island 2 boss) | config.js, protocol.js, swampArena.js (deep ambush pockets) | ai/sarcosuchus.js, dinos.js (unique spawn, swimming and committed movement) | models/dino/sarcoModel.js, sarcoFallback.js, entities/sarcoEffects.js, audio/audio.js | sarcosuchus-boss, sarco-client, sarco-model |
| Spear, bow, melee, knife | config.js (weapons) | world.js (`ACT.MELEE/FIRE/LAND`, knife) | player/actions.js, spearThrow.js, viewmodel.js, entities/projectiles.js, models/weapons.js | weapons, projectile-recovery, butcher |
| Firearms | gunshots.js | firearms.js | models/firearms/, entities/gunEffects.js, player/actions.js | firearms |
| Traps | crafting.js (recipe) | dinos.js (trigger), world.js (`ACT.TRAP`) | player/actions.js, entities/items.js | weapons, inventory-drop |
| Items, inventory, loot | protocol.js, config.js (loot) | world.js (items section) | entities/items.js, ui/hud.js, ui/itemInfo.js, ui/icons.js | inventory-drop, butcher |
| Fruit (per island: `biome.fruit`; buffs) | config.js (fruit), levels.js, layout.js (fruit spots) | world.js (regrowth, eat, `applyFruit`, buffs) | world/fruitPlants.js, models/fruit.js, player/controller.js (buffs), ui/hud.js (`setBuffs`) | discovery-fruit, swamp-fruit, volcano-fruit |
| Crafting | crafting.js | world.js (`craft`) | ui/craftingPanel.js, world/hut/props.js | crafting |
| Skills, XP, downed/revive | skills.js | world.js (skills, downed sections) | ui/skillPanel.js, skillModel.js, core/profile.js, ui/hud.js | skills, skills-server, skills-movement, skills-ui |
| Base, towers, raids | base.js | world.js (base), towers.js, raids.js | world/base.js, ui/basePanel.js | base, raids, raptor-fear |
| Hollow Mountain (level 4, the last): west cove, tunnel maze (chambers, loops, dead ends, crystal halls, flooded tunnels, false exits), the one exit onto the east beach with the escape boat; walls, floor and roof you collide with are the visible volume (`caveVolume.js` -> `caveWalk.js` -> `Terrain.heightAt/ceilingAt`; the fixed map is baked: `caveBake.js`), torch spots, cave decor, lights, raptors in chambers | caveMaze.js, caveField.js, caveVolume.js, caveWalk.js, caveBake.js, island.js (`planCave`), terrain.js (`heightAt`, `ceilingAt`), layout.js (cave section), levels.js (`cave`), relics.js (bell, compass), visibility.js, gunshots.js | world.js (`onState` caps height at the roof), dinos.js (`walkable`: roof clearance) | player/controller.js (steps and head bump on the same grid), world/caveTerrain.js + caveVolumeMesh.js (the mesh), assets/cave, scripts/bakeCave.mjs | cave-level, levels |
| Missions, relics, boat | missions.js, relics.js, boatShape.js | mission.js, world.js (relic pickup, `ACT.REPAIR`) | ui/hud.js (board), ui/boatPanel.js, entities/relics.js, models/props/boat.js | levels, props (no missions test) |
| Boss arena / grove (one feature, two names) | bossArena.js, grove.js | ai/brachio.js (titan), world.js (`groveBlocks`) | world/bossArena.js, world/grove.js, ui/grovePrompt.js | boss-arena, grove |
| Volcano (island 3): caldera with a short ridge path (lava all along one side, two jump and runs over lava fields with sinking columns, lava geysers, bomb zone), a lava lake treasure, lava flows from vent cones + bridges, lava lakes and craters, crater arena, heat, eruptions, ash rain (also on the wind; it chokes, the camp and base shelter) | island.js (round outline, `volcano`, `flows`, small lava `pools`, `bridges`, `fumaroles`), terrain.js (`heatAt`), volcanoArena.js (`ashShelter`), levels.js, config.js (`volcano`, `volcano.ash`), protocol.js (`VOLCANO`, `BOMB`, `GEYSER`, `COLUMN`, `TREASURE`) | volcano.js, pathfind.js (heat), ai/raptor.js + trex.js (ash sight) | world/volcanoArena.js, world/volcanoFx.js, world/terrainMesh.js, player/controller.js (heat, ash, Quickfoot), ui/hud.js (`setHeat`, `setAsh`), world/surfaceDetail.js (settled ash), ui/minimap.js, audio/audio.js | volcano, volcano-fruit |
| Swamp (island 2): bogs, swamp arena, -20 % | island.js (`bogs`, hourglass), terrain.js (`bogAt`, `swampSpeedAt`), swampArena.js, levels.js | dinos.js (`move`), pathfind.js | player/controller.js, world/water.js, world/swampArena.js, world/swampFx.js, veg/swampDecor.js, ui/hud.js (`setSwamp`), ui/minimap.js | swamp |
| Visibility, minimap, tracking | visibility.js | world.js (`canSpotDino`, tracks), dinos.js | ui/minimap.js, entities/tracks.js, entities/dinoViews.js | tracking-minimap, dino-visibility |
| Water, swim, lava | terrain.js, springShape.js | world.js (sea check, lava) | world/water.js, world/rivers.js, player/controller.js | swim, water |
| Outfits | outfits.js | world.js (`ACT.OUTFIT`) | ui/wardrobe.js, models/playerModel.js | outfits |
| Audio | | | audio/* | audio |
| Graphics tier, settings | | | core/renderer.js, graphicsTier.js, settings.js, ui/menus.js | graphics-tier |
| Hosting, LAN, internet, Steam | brand.js | worker.js | net/, ui/steamLobby.js, ui/internetTest.js | http-host, lan-address, internet-host, steam-coop |

## Known hot spots
- `sim/world.js` (~1500 lines), `client/core/game.js` (~1000, imports ~50 modules) and `client/ui/hud.js` (~1000) are touched by almost every feature. Their docs list the areas inside each file.
- `client/models/` and `client/world/` import each other (props use veg/hut shapes). It works, but there is no strict layering between them.

## Not here
Art sources and Blender files are in `art/` (pipeline: `.claude/skills/dino-blender-creator`), runtime assets in `assets/`, offline tooling in `scripts/`, and design notes in `docs/` and `dinosaur_island_game_plan_en.md`.
