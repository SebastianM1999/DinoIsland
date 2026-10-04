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
- The island layout is deterministic from (level, variant seed), so client and server build the same world. Sim spawns and AI use `Math.random` and are **not** deterministic.

## Feature map
Where each feature lives in each layer. Paths are relative to `src/` unless they start with `test/`, `server/` or `desktop/`.

| Feature | shared | sim | client | tests |
|---|---|---|---|---|
| Island gen, terrain, layout | island.js, terrain.js, layout.js, levels.js, rng.js | world.js (`#loadLevel`) | world/terrainMesh.js, sky.js, vegetation.js, veg/, rocks.js, logs.js, sites.js | map-rules, levels, traversal |
| Collision, movement | collision.js, siteFrame.js, *Shape.js | world.js (`onState`), unstuck.js | player/controller.js, player/stuck.js | movement, traversal, spring-collision |
| Netcode, lag comp | protocol.js, config.js (net) | world.js (`receive`, `hitPose`), dinos.js (pose history), hitCheck.js | net/net.js, net/interp.js | netcode, ordering, world-authority |
| Dinos (all) | dinoContact.js | dinos.js, pathfind.js, ai/*.js | entities/dinoViews.js, models/dino/ | dino-visibility, dino-glb, dino-skin, dino-slopes, dino-contact |
| Raptor / stego / trex / ptera / brachio | | ai/raptor.js, stego.js, trex.js, ptera.js, brachio.js | models/dino/ (GLB + procedural fallback) | raptor-fear, stego-tail, ptera-flight, grove |
| Spear, bow, melee, knife | config.js (weapons) | world.js (`ACT.MELEE/FIRE/LAND`, knife) | player/actions.js, spearThrow.js, viewmodel.js, entities/projectiles.js, models/weapons.js | weapons, projectile-recovery, butcher |
| Firearms | gunshots.js | firearms.js | models/firearms/, entities/gunEffects.js, player/actions.js | firearms |
| Traps | crafting.js (recipe) | dinos.js (trigger), world.js (`ACT.TRAP`) | player/actions.js, entities/items.js | weapons, inventory-drop |
| Items, inventory, loot | protocol.js, config.js (loot) | world.js (items section) | entities/items.js, ui/hud.js, ui/itemInfo.js, ui/icons.js | inventory-drop, butcher |
| Fruit (per island: `biome.fruit`; buffs) | config.js (fruit), levels.js, layout.js (fruit spots) | world.js (regrowth, eat, `applyFruit`, buffs) | world/fruitPlants.js, models/fruit.js, player/controller.js (buffs), ui/hud.js (`setBuffs`) | discovery-fruit, swamp-fruit, volcano-fruit |
| Crafting | crafting.js | world.js (`craft`) | ui/craftingPanel.js, world/hut/props.js | crafting |
| Skills, XP, downed/revive | skills.js | world.js (skills, downed sections) | ui/skillPanel.js, skillModel.js, core/profile.js, ui/hud.js | skills, skills-server, skills-movement, skills-ui |
| Base, towers, raids | base.js | world.js (base), towers.js, raids.js | world/base.js, ui/basePanel.js | base, raids, raptor-fear |
| Missions, relics, boat | missions.js, relics.js, boatShape.js | mission.js, world.js (relic pickup, `ACT.REPAIR`) | ui/hud.js (board), ui/boatPanel.js, entities/relics.js, models/props/boat.js | levels, props (no missions test) |
| Boss arena / grove (one feature, two names) | bossArena.js, grove.js | ai/brachio.js (titan), world.js (`groveBlocks`) | world/bossArena.js, world/grove.js, ui/grovePrompt.js | boss-arena, grove |
| Volcano (island 3): caldera, lava flows + bridges, small craters, crater arena, heat, eruptions and stray lava bombs | island.js (round outline, `volcano`, `flows`, `bridges`, `craters`, `fumaroles`), terrain.js (`heatAt`), volcanoArena.js, levels.js, config.js (`volcano`), protocol.js (`VOLCANO`, `BOMB`) | volcano.js, pathfind.js (heat), ai/raptor.js + trex.js (ash sight) | world/volcanoArena.js, world/volcanoFx.js, world/terrainMesh.js, player/controller.js (heat, Quickfoot), ui/hud.js (`setHeat`), ui/minimap.js, audio/audio.js | volcano, volcano-fruit |
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
