# world
> Turns the deterministic island layout from `shared/layout.js` (plus `shared/terrain.js`) into Three.js scenery: terrain, sky, water/lava, vegetation, rocks, logs, fruit plants, hut, team base, special sites, boss arena and grove barrier.

## Files
- `terrainMesh.js` — `buildTerrainMesh`: smooth, biome-coloured island mesh from the shared Terrain grid (also tints the boss-arena ground; on the volcano: scorched ground and glowing cracks by heat, green pockets, the crater's dark basalt, the bridges' grey decks); writes `surface`/`surface2` weights (sand, rock, path, forest, wet, ash) for the detail shader.
- `surfaceDetail.js` — procedural per-pixel surface detail (no textures): `withSurfaceDetail(mat, kind)` / cached `detailMaterial(base, kind)` for `terrain` (grass, leaf litter, trails, sand ripples/shells/tide line, cliffs, ash), `rock` (granite, sandstone, basalt, limestone picked from the instance tint) and `foliage` (leaf grain, per-tree tone, blossoms); `SURFACE` uniforms (`uSdAsh`: the volcano's fresh ash on every detail material's upward faces), `setSurfaceQuality(graphics)`, `setSurfaceBiome(biome)`.
- `sky.js` — `buildSky`: gradient dome, sun, drifting clouds, distant islands; `mood()` for darker air.
- `water.js` — `buildWater`: one shared shader for sea, pools, rivers and the swamp's bogs (`bogGeometry`: murky, dull sheet per field level; depth from a terrain height texture, foam, rapids, waterfall plunge) and lava (crust plates and molten lava; the volcano's small craters glow molten almost to the rim); `ripple()` / `splash()`.
- `rivers.js` — geometry helpers for water surfaces: `riverGeometry`, `discGeometry`, `withSheetAttrs` (common `aFlow`/`aRiver` attributes).
- `vegetation.js` — `buildVegetation`: instanced trees, bushes, ferns, grass and flowers per biome with wind, per-kind biome tints (`biome.vegetation.tints`), chunks past the fog culled; `setQuality`/`setDensity`; `VEG_TUNING`.
- `rocks.js` — `buildRocks` / `rockGeo`: boulders from `shared/rockShapes.js` tables (stone kind per rock from `biome.rocks.kinds`, clustered by region) and sea stacks (with palms on green islands).
- `logs.js` — `buildLogs`: fallen trunks from `layout.logs`, merged into one mesh.
- `fruitPlants.js` — `buildFruitPlants`: the fruit of every kind by its role (`KINDS`: bush, tree, glowing plant – berry/mango/dragon, swamp marshberry/swampfig/glowlotus, volcano emberchili/ashplum/obsidianfig); `setCount(spotId, n)` with pop-in.
- `hut.js` — `buildHut`: hunting hut (cabin, drop-off, workbench, mission board, wardrobe, flag, campfire, camp ground from `hutFloor`) or the small landing camp on islands 2+.
- `base.js` — `buildBaseView`: the team base on islands 2+ (plot stakes, scaffolding, camp/lodge/fort stages, towers, raid damage); `setBase`, `shoot`; `stakePoint`.
- `baseGround.js` — `flagstones` (irregular laid slabs with joints, optional gaps for stepping stones) and `campClutter` (a few varied stones, sticks, firewood) used by `hutFloor` (hunting hut / landing camp) and `baseFloor` (base yard and paths that grow with the stage, plank porch before the cabin; decoration, no collider) and `stoneWall` (the volcanic fort wall: coursed blocks, pillars, merlons, gate towers inside the palisade colliders); stone pieces use the `rock` detail material.
- `sites.js` — `buildSites`: places boat, caves, spring cave, ruins, nest and volcano FX from `models/props/`.
- `bossArena.js` — `buildBossArena`: lava islet look (spires, rune gate, basalt, embers, ritual circle) from `layout.bossArena`.
- `volcanoArena.js` — `buildVolcanoArena`: the crater arena's basalt column clusters with glowing feet, the warning sign at the notch, bones (`layout.volcanoArena`).
- `volcanoFx.js` — `buildVolcanoFx`: ash flakes round the camera, moved in a shader (a thick fall on each rain's own wind in the ash rain, when the fog draws in: `ashSky` through `onFog`), curtains of falling ash further off, fresh ash settling on what faces up (`SURFACE.uSdAsh`) and fading after, `ashRaining()`, fumarole steam, the eruption's lava spray and crater glow, lava bombs (warning circle, flight from the crater, burst: `onImpact`); state from the server (`setState`, `setPhase`, `bomb`).
- `swampArena.js` — `buildSwampArena`: the swamp arena's ring and waist walls of giant dead mangroves and root tangles, the sign at the entrance gate, bones (`layout.swampArena`).
- `swampFx.js` — `buildSwampFx`: mist over the whole swamp, thicker in places (`mistiness`); the fog draws in where it is thick (`thickSky`, blended through `onFog`), mist banks and fireflies near the camera by graphics tier.
- `grove.js` — `buildGrove`: shimmering red barrier cylinder around the giant's pen; `strike(pt)` and `flash()`.

### hut/
- `hut/cabin.js` — `buildCabin` and `CABIN` dimensions of the log cabin.
- `hut/pieces.js` — shared building pieces and palette (`COL`, `tone`, `box`, `plank`, `log`, `crate`, `barrel`, `lashing`, `footprint`).
- `hut/props.js` — static hut props (drop-off, workbench, mission board, wardrobe, flagpole, campfire) returning `{ std, glossy, glow }` geometry lists; `ARROW_BARREL`, `FLAG_ATTACH`.
- `hut/fx.js` — animated parts: waving flag, campfire flames and light, pooled smoke, arrow stock.

### veg/
- `veg/trees.js` — procedural tree types (palm ... dead; swamp: mangrove, snag, nipa, swampfig; volcano: charred, ashplum with `ASHPLUM_FRUIT_LOCAL`; `deadMangroveGeometry` for the arena wall) as cached `{ trunk, foliage }`; crown variants (`CROWN_TYPES`, `CROWN_VARIANTS`) reshape and recolour only the foliage, the trunk stays (leaf-clump crowns only: never the pine, whose overlapping fir tiers rise past the trunk's end to the tip); `treeMatrix`, `TREE_WIND`, `TREE_VARIANTS`, `MANGO_FRUIT_LOCAL`, `SWAMPFIG_FRUIT_LOCAL`.
- `veg/plants.js` — small plants (bush, fern, big leaf, shrub, reed with cattails, grass, flower, berry bush, dragon plant, swamp marsh shrub and glow lotus, volcano chili shrub and obsidian-fig cactus); `BUSH_TYPES`.
- `veg/swampDecor.js` — `buildSwampDecor`: lily pads and duckweed on the bogs, breathing-root fields on their mud shores (instanced, handed to `SpatialInstances`).
- `veg/shapes.js` — shared vegetation helpers (`clump`, `leafStrip`, `arcPath`, `LEAF_MAT`, `windPair`, `glowMaterial`, `instanced`, `foliageTint`, geometry-detail scope).
- `veg/spatialInstances.js` — `SpatialInstances`: splits instances into 80 m chunks so each batch is culled separately (and hidden past `setCullDistance`); quality/density control.

## Entry points
- `core/game.js` `#buildWorld()` calls every `build*` here with `(terrain, layout)` (`buildSky(gfx, layout)`, `buildWater(..., sunDir)`), adds each `.group` to the scene and calls `update(dt, time, cam)` on all but logs each frame (`worldUpdaters`). It also calls `water.ripple/splash`, `sky.mood`, `fruitPlants.setCount`, `baseView.setBase/shoot`, `grove.strike/flash`, `sites.boat.setRepaired/setParts`, `vegetation/rocks.setQuality`.
- `player/actions.js` uses `stakePoint` from `base.js`.
- `models/props/*` and `models/fruit.js` reuse `veg/shapes.js`, `veg/plants.js` and `hut/pieces.js`.
- Tests: `test/water.test.js`, `test/discovery-fruit.test.js`, `test/props.test.js` (trees, `BUSH_TYPES`).

## Rules
- Visual only and deterministic: everything with a collider or gameplay meaning (trees, bushes, rocks, logs, hut, plots, sites, arena) is placed from `layout` / `terrain`. Purely decorative detail (grass tufts, flowers) is scattered here with seeded `shared/rng.js` and has no collider; `Math.random` appears only in particle/flicker effects (embers, smoke, fire light).
- Geometry must match the shared shapes that colliders use: trunks from `shared/treeShapes.js` (`treeMatrix` must match `treePoint`), rocks from `shared/rockShapes.js`, base from `shared/base.js`, terrain triangulation matches `Terrain.heightAt()`, cabin size matches its `layout.js` collider, log colliders come from the layout.
- Builders return `{ group, update?, ... }`; per-frame work reuses preallocated objects and skips animation beyond a camera range (`ANIM_RANGE`).
- Static pieces are merged into a few meshes with the shared `models/kit.js` materials (vertex colours, no textures); many copies use instancing.
- Small-scale surface detail is procedural in the fragment shader (`surfaceDetail.js`), driven by vertex attributes, instance tints and world/object position, never image textures; it fades with distance and follows the graphics tier (Low = macro variation only, Medium = no bump).
- Cached geometries/materials shared across islands are marked `sharedResource` (directly or via `retainResource`) so island disposal skips them.
- Wind sway goes through `kit.windMaterial` driven by `WIND.uTime` (set in `core/game.js`).

## Not here
- Layout, colliders, biome data and shape tables: `src/shared/` (`layout.js`, `terrain.js`, `*Shape(s).js`, `base.js`, `bossArena.js`, `grove.js`, `swampArena.js`, `volcanoArena.js`).
- Site prop models (boat, caves, ruins, nest, volcano, relics): `client/models/props/`.
- Moving server-owned things (dinos, items, relics, tracks): `client/entities/`.
- Dialogs at the hut/base: `client/ui/`.
