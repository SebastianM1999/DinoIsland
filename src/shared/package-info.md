# src/shared
> Pure, deterministic data and rules imported by both the client (`src/client/`) and the authoritative simulation (`src/sim/`), plus the network protocol and tunables used by `server/` and `desktop/`.

## Files

### Island generation & terrain
- `rng.js` — seeded PRNG (`makeRng`, Mulberry32), `hash2`, `valueNoise`, `fbm`, and math helpers (`clamp`, `lerp`, `smoothstep`, `angleDiff`).
- `levels.js` — biome definitions (`BIOMES` jungle, volcano, swamp: vegetation, rock palette + stone-kind tints, sites, dinos, music, outline `shape`) and the island list (`LEVELS`: Emerald Jungle, Misty Swamp, Ashfall Isle); `levelDef(index)` returns the full definition incl. difficulty, dino counts, size `scale`, `seedIndex` (Ashfall keeps the seeds it had as island 2), grove/boss-arena/swamp-arena flags.
- `island.js` — island generator: `planIsland(levelIndex, variant)` builds the plan (hut beach, boat beach, hills/volcano, rivers/lava, pools, sites, trail; swamp: hourglass outline, flat relief, creek, side `paths`, `bogs`; volcano: round outline, the caldera with its crater floor and notch (`calderaInner`), the mountain path up through the notch, lava `flows` from flank vents (each wells out of a low cinder cone, `ventEffect`, between high banks) plus the crater moat, small lava craters (`pools` with `small`: lava in a bowl with a raised rim, on gentle lowland off paths and camps), basalt `bridges` where paths cross them, `crusts` plates on the flows, `fumaroles`); `islandHeight`, `riverQuery` / `flowDist` / `flowsOf` (every flow), `bridgeAt`, `crustAt`, `crustWarp`, `poolAt`, `islandSeed`, outline `halfWidthAt` / `insideOutline` (`HOURGLASS`), bogs `bogSample` (`BOG`: max 0.3 m deep, dry causeways); `CAVES_ENABLED` (currently `false`).
- `terrain.js` — `Terrain`: samples the plan onto a grid once and answers `heightAt`, `slopeAt`, `gradientAt`, water/lava/sea level and depth queries (bog water included), `isWalkable`; swamp: `bogAt`, `bogLevelAt`, `swampSpeedAt` (the -20 % rule for players and dinosaurs); volcano: `heatAt` (0..1 from the distance to lava and fumaroles, `HEAT`), `crustAt`; no lava under a bridge or a crust plate.
- `layout.js` — `buildLayout(terrain)`: deterministic placement of hut, boat, trees, rocks, bushes, fruit spots, sites, dino zones, nests, paths and all static colliders. Swamp arena mangroves stay on shallow banks outside deep boss ambush pockets.
- `bossArena.js` — the first island's lava islet: `planBossArena` (placed from the boat, no randomness), causeway and height shaping, `insideBossArena`.
- `grove.js` — the giant Brachiosaurus pen on the boss arena plateau (`GROVE`): barrier tests `insideGrove`, `groveEntry`, `mayEnterGrove`, `titanScale`.
- `volcanoArena.js` — the crater arena on top of the volcano (`VOLCANO_ARENA`): `planVolcanoArena` (the floor, the lava moat round it, the entrance at the notch – `locked` once the boss exists – and the boss spawn), `insideVolcanoArena`, `entranceOffset`, `moatFlow`, `ashShelter` (the camp clearing and the base plots: shelter from the ash rain) (the moat as a lava flow, open at the entrance); its boss (the T-Rex) comes later.
- `swampArena.js` — the swamp's root-walled kettle in the middle of the hourglass waist, the only way to the second half (`SWAMP_ARENA`): `planSwampArena` (entrance gate west, exit gate east, both gates remain open), `insideSwampArena`, `gateOffset`, ring colliders (`arenaWallColliders`, `onArenaWall`), the waist walls out into the deep sea (`waistWalls`, `waistWallColliders`), boss spawn and deep ambush pockets beside the dry causeway for Alpha Sarcosuchus.

### Collider/shape builders
- `siteFrame.js` — local-to-world frame for placed sites (`toWorld`, `boxRot`, `siteBox`).
- `collision.js` — 2D collision against circle and oriented-box colliders (`resolveCircle`, `penetration`, `standTop`), segment/ray tests (`segmentColliders`, `raySphere`, `segmentSphere`).
- `treeShapes.js` — trunk centerlines per tree type (`TRUNKS`) and `treeColliders` built from the same numbers as the meshes.
- `rockShapes.js` — rock ring tables (`ROCK_VARIANTS`: boulder, block, slab, stepped, formation, crag, table rock; `rockTable`), `placeRock`, walkable surface `rockSurfaceAt`/`rockHeightAt`; pebbles below `PEBBLE_SCALE` have no collision.
- `caveShape.js` — cave dome dimensions, colliders, interior/mouth points, rock piles.
- `ruinsShape.js` — ruins plaza layout from a seed (`ruinsLayout`), colliders, altar top for the relic.
- `boatShape.js` — wrecked boat dimensions, relic sockets, hull colliders and interact point.
- `springShape.js` — waterfall grotto SDF (`springSdf`, 3D noise helpers), lip/floor offsets and `springColliders`.

### Gameplay rules & catalogs
- `base.js` — team base on islands after the first: stages, costs per island, towers, repair costs, plot geometry, palisade, colliders, camp stations and safe zone.
- `crafting.js` — workbench recipes (supplies and team upgrades by tier), `upgradeMods`, `canAfford`, `unlockIsland`.
- `skills.js` — skill trees, XP/levels (`LEVEL_CAP`, `xpForLevel`, `levelFromXp`), XP rewards, `DASH`, profile buy/validation (`sanitizeProfile`, `canBuy`, `buy`), `skillMods`, `creativeProfile`.
- `missions.js` — team contracts (`CONTRACTS`) for the mission board: event key, goal, reward.
- `relics.js` — boat-part relic kinds and which site type hides each (`RELICS`, `RELIC_KINDS`, `RELIC_FOR_SITE`).
- `outfits.js` — hat/top/pants catalogs, `defaultOutfit`, `sanitizeOutfit`, `sameOutfit`.
- `dinoContact.js` — player-vs-dinosaur body contact: `dinoBodyCircles` footprint and swept `resolveDinoContact`; `DINO_CONTACT` damage/knockback/cooldown.
- `gunshots.js` — `shotEnd`: where a hitscan shot stops (colliders, grove barrier, terrain), used for tracers and validation.
- `visibility.js` — `lineBlocked` (terrain + tree/rock occlusion) and `DINO_SIGHTING` thresholds for dinosaur discovery.

### Netcode, config & brand
- `protocol.js` — JSON message types (`MSG`), client actions (`ACT`), events (`EV`; the volcano's `VOLCANO`, `BOMB`, `CRUST`), snapshot field lists (boss attack clip/start/duration/sequence), player flags (`PF`), `EQUIP`, dino states (`DS`, including Sarcosuchus swimming and committed attacks), `DINO_TYPES`; the header documents the authority model.
- `config.js` — `CONFIG`: all tunables (net, world, player, weapons, hit zones, volcano – heat, crust plates, eruption cycle, lava bombs, ash rain –, fruit – kinds with a `role` and optional `buff`, and the `buffs` –, loot, dinos, tracks, mission, render, audio).
- `brand.js` — `BRAND` (name, slug, storage prefix), `storageKey`, `migrateStorage`.

## Entry points
- `planIsland` -> `new Terrain(plan)` -> `buildLayout(terrain)` is the world-building chain, run identically by `src/sim/world.js` and `src/client/core/game.js` (also `src/client/ui/preview.js`, and many tests).
- `protocol.js` and `config.js` are imported almost everywhere: `src/sim/*` and `src/sim/ai/*`, `src/client/*`, `server/gameHost.js`, `server/index.js`, `desktop/steam-session.js`.
- `collision.js` is used by `src/client/player/controller.js` (local movement) and `src/sim/dinos.js`, `src/sim/unstuck.js`, `src/sim/world.js` (server checks).
- Shape builders (`caveShape`, `ruinsShape`, `boatShape`, `springShape`, `treeShapes`, `rockShapes`) feed colliders into `layout.js` and the matching meshes in `src/client/models/props/*.js`, `src/client/world/rocks.js`, `src/client/world/veg/trees.js`, `src/client/world/water.js`.
- Rule catalogs: `base.js` (sim `world.js`, `raids.js`, `towers.js`; client `world/base.js`, `ui/basePanel.js`), `crafting.js` (sim `world.js`; client `ui/craftingPanel.js`), `skills.js` (sim `world.js`, `dinos.js`; client `core/profile.js`, `ui/skillPanel.js`, `ui/skillModel.js`, `player/controller.js`), `missions.js` (sim `mission.js`; client `ui/hud.js`), `outfits.js` (sim `world.js`; client `ui/wardrobe.js`, `models/playerModel.js`).
- `brand.js` is used by client UI/settings, `src/sim/mission.js`, `server/index.js`, `server/internetHost.js`, `desktop/steam-session.js`.

## Rules
- Imports only other files in `src/shared/` — never `src/client/`, `src/sim/`, `three`, Node built-ins or DOM APIs. `brand.js#migrateStorage` touches storage only through an injectable argument (defaults to `globalThis.localStorage`, wrapped in try/catch).
- Deterministic: no `Math.random`, no clock reads. All procedural placement goes through seeded `rng.js` (or the local hash in `springShape.js`), so client and server build the same island from `(level index, variant)`.
- Plain data that both Node and the browser can load: colors are hex strings (the client converts them to THREE colors).
- Visible shape and collider come from one table: tree, rock, cave, ruins, boat and spring meshes must be built from the same exported numbers the colliders use. Change the shape here, not in the client model only.
- Site frames follow `siteFrame.js`: local +x maps to world `(cos rot, -sin rot)`; box collider `rot` is the negated THREE yaw.
- Client-supplied profiles and outfits are re-validated in `src/sim/world.js` with `sanitizeProfile` / `sanitizeOutfit`; both accept arbitrary input (null, wrong types) and clamp to a valid value.
- Protocol changes must stay in sync with `src/sim/world.js` (handler), `src/client/net/net.js` (sender) and the 8 KiB inbound cap in `server/gameHost.js` / 8192-byte cap in `desktop/steam-session.js`. Steam's unreliable routing depends on the `snap`/`state` type strings.
- Renaming `BRAND.slug` or `storagePrefix` has player-visible effects (Steam lobby visibility, saved settings); see the notes in `brand.js`.

- The butcher protocol distinguishes successful completion (`EV.BUTCHER.done`) from cancellation; timings in `CONFIG.dinos` are reduced by `skillMods.knifeTimeMul` on the server.

## Not here
- Authoritative game logic (AI, damage, inventory, raids, missions progress): `src/sim/`.
- Meshes, materials, UI, input, audio, client networking: `src/client/`.
- HTTP/WebSocket hosting: `server/`. Electron/Steam: `desktop/`.
- Map art and level design rules: the `map-design-rules` skill (checked numerically by `test/map-rules.test.js`).
