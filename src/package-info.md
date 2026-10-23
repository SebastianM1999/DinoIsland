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
- **Solo (browser):** `Net.local` (`client/net/net.js`) starts `sim/worker.js` as a Web Worker, so the same `ServerWorld` runs off the render thread; saved expeditions live in IndexedDB (`client/net/expeditions.js`).
- **Solo and hosting (desktop):** the Electron app (`desktop/main.cjs`) runs the server in a utility process (`desktop/host-process.js`) that owns the player's saved expeditions (`server/saveCoordinator.js`); solo is the open expedition with a private lobby, Steam hosting opens the same expedition to friends.
- **Co-op:** Steam only. `server/gameHost.js` runs `ServerWorld` and talks WebSocket to the desktop window over loopback; Steam players are bridged into the same host (`desktop/hostBridge.js`). There is no LAN or internet play.
- **Steam:** `desktop/steam*.cjs/js` + `client/net/steamTransport.js` carry the same protocol over Steam P2P.

## Authority model (details at the top of `shared/protocol.js`)
- The server owns dinosaurs, items, fruit, map resources, traps, health, inventories, missions, the hut store and the base.
- Clients own only their own movement and send it about 20 times a second. They report hits; the server checks the hits against the dinos' past poses (lag compensation, `CONFIG.net.lagCompMax`).
- The island layout is deterministic from (level, variant seed), so client and server build the same world: bit for bit in every JS engine (Node, Chrome, Electron, Firefox, Safari), because shared code uses `shared/dmath.js` instead of the engines' transcendental `Math` functions. Every island is a fixed map: its variant comes from `shared/levels.js` (`?variant=N` overrides it for testing). Sim spawns and AI use `Math.random` and are **not** deterministic.

## Feature map
Where each feature lives in each layer. Paths are relative to `src/` unless they start with `test/`, `server/` or `desktop/`.

| Feature | shared | sim | client | tests |
|---|---|---|---|---|
| Island gen, terrain, layout | island.js, terrain.js, layout.js, levels.js, rng.js, dmath.js (same bits in every JS engine) | world.js (`#loadLevel`) | world/terrainMesh.js, sky.js, vegetation.js, veg/, rocks.js, logs.js, sites.js | map-rules, levels, traversal, dmath, cross-engine, shared-math-lint |
| Collision, movement | collision.js, siteFrame.js, *Shape.js | world.js (`onState`), unstuck.js | player/controller.js, player/stuck.js | movement, traversal, spring-collision |
| Netcode, lag comp | protocol.js, config.js (net) | world.js (`receive`, `hitPose`), dinos.js (pose history), hitCheck.js | net/net.js, net/interp.js | netcode, ordering, world-authority |
| Dino ranks (rare alphas: bigger, tougher, double loot; bosses), butcher times 3 / 5 / 10 s, loot only from butchering | dinoRank.js | dinos.js (`spawn`, `dropCarcassLoot`: arrows only), world.js (`startButcher`, `carcassLoot`) | entities/dinoViews.js (alpha bar), player/actions.js (knife) | butcher |
| Dinos (all) | dinoContact.js, treeShapes.js (leaf crowns) | dinos.js, pathfind.js, ai/*.js | entities/dinoViews.js, models/dino/ | dino-visibility, dino-glb, dino-skin, dino-slopes, dino-contact |
| Dino senses (view cone + line of sight, noise events, awareness, memory and search; docs/dino-ai-concept.md phase 1) | config.js (`dinos.<type>.ai.senses`, `height`), visibility.js (`occluderGrid`), torch.js (`carriesLight`), base.js (`SAFE_MARGIN`) | ai/senses.js, dinos.js (`updateSenses` per tick, `noise`), world.js (`playerNoise`, `aiRng`), firearms.js (gun noise), ai/raptor.js, ai/trex.js | (none: perception is server-only) | dino-senses, sight-grid, gloom-raptor, test-dinos |
| Gloom raptor (cave packs of the Hollow Mountain level; hunts by noise, sees torches, spawns only at `layout.caveDinoSpots`) | config.js (`dinos['gloom-raptor']`), protocol.js | ai/gloomRaptor.js (+ `packHunterBrain` in ai/raptor.js, its senses in ai/senses.js) | entities/dinoViews.js, models/dino/glbCatalog.js, audio/audio.js | gloom-raptor, dino-glb |
| Sump lurker (cave ambusher in flooded tunnels; spawns only at flooded `layout.caveDinoSpots`) | config.js (`dinos['sump-lurker']`, `aquatic` flag), protocol.js | ai/sumpLurker.js, ai/aquatic.js (shared with the sarcosuchus), dinos.js (swimming/carcass via `aquatic`) | models/dino/sumpModel.js, glbCatalog.js, sarcoFallback.js, entities/sarcoEffects.js, audio/audio.js | sump-lurker, dino-glb, sarcosuchus-boss |
| Crystal plodder (cave herbivore, glowing crystals; one per big hall, never beside a gloom pack) | config.js (`dinos['crystal-plodder']`), protocol.js, caveDinos.js (`plodderChambers`, one place that picks the halls) | ai/crystalPlodder.js, ai/territorial.js (tail sweep + graze loop shared with the stego), ai/gloomRaptor.js (skips plodder halls) | models/dino/glbCatalog.js + glbDino.js (`glow`: unlit crystal material), crystalPlodder.js (fallback), entities/dinoViews.js, audio/audio.js | crystal-plodder, dino-glb, cave-level |
| New island 1 species (Triceratops, Ankylosaurus, Pachycephalosaurus: defensive herbivores; Dilophosaurus, Spinosaurus: placeholder pack AI) | config.js (`dinos.<type>`, `ai.defend`, `ai.utility`), protocol.js, levels.js (island 1 `dinos`) | ai/triceratops.js, ankylosaurus.js, pachycephalosaurus.js (on ai/defender.js + utility.js), ai/testDinos.js (raptor pack brain, `ringHome`) | models/dino/glbCatalog.js, entities/dinoViews.js (procedural fallback = nearest older model), audio/catalog.js (borrowed roars) | test-dinos, dino-utility, dino-glb |
| Raptor / stego / trex / ptera / brachio | | ai/raptor.js, stego.js, trex.js, ptera.js, brachio.js | models/dino/ (GLB + procedural fallback) | raptor-fear, stego-tail, ptera-flight, grove, dino-pack (slots, tokens, regroup, lead), dino-director (hunt budget, phases, stalking), dino-utility (escalation, herd memory, leash, T-Rex chase economics, ptera targeting) |
| Alpha Sarcosuchus (island 2 boss) | config.js, protocol.js, swampArena.js (deep ambush pockets) | ai/sarcosuchus.js, dinos.js (unique spawn, swimming and committed movement) | models/dino/sarcoModel.js, sarcoFallback.js, entities/sarcoEffects.js, audio/audio.js | sarcosuchus-boss, sarco-client, sarco-model |
| Spear, bow, melee, knife | config.js (weapons) | world.js (`ACT.MELEE/FIRE/LAND`, knife) | player/actions.js, spearThrow.js, viewmodel.js, entities/projectiles.js, models/weapons.js | weapons, projectile-recovery, butcher |
| Bow find (island 1: each explorer takes their bow at a hunter's camp; later islands start with it) | levels.js (`biome.bowCamp`), layout.js (`bowCamp`), config.js (`weapons.bow.pickupReach`), protocol.js (`BOW_FOUND`) | world.js (`inv.bow`: `freshInventory`, camp pickup in `step`, no arrow shot without it, `nextLevel`, refill/respawn, creative) | world/bowCamp.js, player/actions.js (locked slot), ui/hud.js (slot text), core/game.js (camp, quest line, minimap) | bow-find, player-actions |
| Firearms | gunshots.js | firearms.js | models/firearms/, entities/gunEffects.js, player/actions.js | firearms |
| Traps | crafting.js (recipe) | dinos.js (trigger), world.js (`ACT.TRAP`) | player/actions.js, entities/items.js | weapons, inventory-drop |
| Items, inventory, loot (pockets 1-7, 2x3 backpack: max `player.backpackSlots` material kinds) | protocol.js, config.js (loot, `player.backpackSlots`) | world.js (items section, `addLoot`, `caps().slots`) | entities/items.js, player/pockets.js, player/actions.js, ui/hud.js, ui/itemInfo.js, ui/icons.js, ui/characterPreview.js | inventory-drop, backpack-slots, pockets, player-actions, butcher |
| Fruit (per island: `biome.fruit`; buffs) | config.js (fruit), levels.js, layout.js (fruit spots) | world.js (regrowth, eat, `applyFruit`, buffs) | world/fruitPlants.js, models/fruit.js, player/controller.js (buffs), ui/hud.js (`setBuffs`) | discovery-fruit, swamp-fruit, volcano-fruit |
| Map resources (island 1: resin, ironwood, healing herb; per island: `biome.resources`) | config.js (loot, `resources`), levels.js, layout.js (`resourceSpots`), crafting.js (tier 1 costs), protocol.js (`GATHER`, `RESOURCE`) | world.js (`ACT.GATHER`, `addLoot`, regrowth) | world/resourceNodes.js, models/props/resources.js, player/actions.js (E prompt), entities/items.js (dropped), ui/icons.js | resources, crafting |
| Crafting | crafting.js | world.js (`craft`) | ui/craftingPanel.js, world/hut/props.js | crafting |
| Skills, XP, downed/revive | skills.js | world.js (skills, downed sections) | ui/skillPanel.js, skillModel.js, ui/hud.js (the profile belongs to the expedition: `MSG.PROF`) | skills, skills-server, skills-movement, skills-ui |
| Base, towers, raids; island 1's tent camp and camp table | base.js (`CAMP_BENCH`, `campStations`), layout.js (`hut.kind`) | world.js (base, `buildCampBench`, `craft`), towers.js, raids.js | world/base.js, world/hut.js, world/hut/tent.js, ui/basePanel.js, player/actions.js (E prompt) | base, raids, raptor-fear, crafting |
| Hollow Mountain (level 4, the last): west cove, tunnel maze (chambers, loops, dead ends, crystal halls, flooded tunnels, false exits), the one exit onto the east beach with the escape boat; walls, floor and roof you collide with are the visible volume (`caveVolume.js` -> `caveWalk.js` -> `Terrain.heightAt/ceilingAt`; the fixed map is baked: `caveBake.js`), torch spots, cave decor, lights, raptors in chambers | caveMaze.js, caveField.js, caveVolume.js, caveWalk.js, caveBake.js, island.js (`planCave`), terrain.js (`heightAt`, `ceilingAt`), layout.js (cave section), levels.js (`cave`), relics.js (bell, compass), visibility.js, gunshots.js | world.js (`onState` caps height at the roof), dinos.js (`walkable`: roof clearance) | player/controller.js (steps and head bump on the same grid), world/caveTerrain.js + caveVolumeMesh.js (the mesh), assets/cave, scripts/bakeCave.mjs | cave-level, levels |
| Missions, relics, boat | missions.js, relics.js, boatShape.js | mission.js (`sail`), world.js (relic pickup, `ACT.REPAIR`, `ACT.SAIL`) | ui/hud.js (board), ui/boatPanel.js, entities/relics.js, models/props/boat.js | levels, props (no missions test) |
| Boss arena / grove (one feature, two names) | bossArena.js, grove.js | ai/brachio.js (titan), world.js (`groveBlocks`) | world/bossArena.js, world/grove.js, ui/grovePrompt.js | boss-arena, grove |
| Volcano (island 3): caldera with a short ridge path (lava all along one side, two jump and runs over lava fields with sinking columns, lava geysers, bomb zone), a lava lake treasure, lava flows from vent cones + bridges, lava lakes and craters, crater arena, heat, eruptions, ash rain (also on the wind; it chokes, the camp and base shelter) | island.js (round outline, `volcano`, `flows`, small lava `pools`, `bridges`, `fumaroles`), terrain.js (`heatAt`), volcanoArena.js (`ashShelter`), levels.js, config.js (`volcano`, `volcano.ash`), protocol.js (`VOLCANO`, `BOMB`, `GEYSER`, `COLUMN`, `TREASURE`) | volcano.js, pathfind.js (heat), ai/raptor.js + trex.js (ash sight) | world/volcanoArena.js, world/volcanoFx.js, world/terrainMesh.js, player/controller.js (heat, ash, Quickfoot), ui/hud.js (`setHeat`, `setAsh`), world/surfaceDetail.js (settled ash), ui/minimap.js, audio/audio.js | volcano, volcano-fruit |
| Swamp (island 2): bogs, swamp arena, -20 % | island.js (`bogs`, hourglass), terrain.js (`bogAt`, `swampSpeedAt`), swampArena.js, levels.js | dinos.js (`move`), pathfind.js | player/controller.js, world/water.js, world/swampArena.js, world/swampFx.js, veg/swampDecor.js, ui/hud.js (`setSwamp`), ui/minimap.js | swamp |
| Visibility, minimap, tracking | visibility.js | world.js (`canSpotDino`, tracks), dinos.js | ui/minimap.js, entities/tracks.js, entities/dinoViews.js | tracking-minimap, dino-visibility |
| Water, swim, lava | terrain.js, springShape.js | world.js (sea check, lava), dinos.js (land dinosaurs swim across inland water) | world/water.js, world/rivers.js, player/controller.js | swim, water, dino-water |
| Outfits | outfits.js | world.js (`ACT.OUTFIT`) | ui/wardrobe.js, models/playerModel.js | outfits |
| Audio | | | audio/* | audio |
| Graphics tier, settings | | | core/renderer.js, graphicsTier.js, settings.js, ui/menus.js | graphics-tier |
| Expedition saves (multiple independent expeditions; XP, skills, inventory and island progress per expedition; autosave, checkpoints, Save & quit, backups, desktop files per Steam account, browser IndexedDB) | saveSchema.js | worldSave.js, world.js (`roster`, `checkpoint`, `opts.firstId/now`), worker.js | net/expeditions.js, ui/expeditionPanel.js, core/persistence.js (preferences), main.js (picker, Save & quit); server/saveStore.js, saveCoordinator.js, saveRoutes.js, gameHost.js (`load`/`unload`/`admit`); desktop/host-process.js, hostBridge.js (Steam players), personal-store.cjs, main.cjs | world-save, save-store, save-host, save-guests, solo-worker, expeditions-client |
| Hosting, Steam co-op | brand.js, protocol.js (`PROTOCOL_VERSION`) | worker.js | net/, ui/steamLobby.js; server/gameHost.js (version check); desktop/steamStart.cjs, steam.cjs, logFile.cjs | http-host, steam-coop, version-handshake, desktop-start |

## Known hot spots
- `sim/world.js` (~1500 lines), `client/core/game.js` (~1000, imports ~50 modules) and `client/ui/hud.js` (~1000) are touched by almost every feature. Their docs list the areas inside each file.
- `client/models/` and `client/world/` import each other (props use veg/hut shapes). It works, but there is no strict layering between them.

## Not here
Art sources and Blender files are in `art/` (pipeline: `.claude/skills/dino-blender-creator`), runtime assets in `assets/`, offline tooling in `scripts/`, and design notes in `docs/` and `dinosaur_island_game_plan_en.md`.
