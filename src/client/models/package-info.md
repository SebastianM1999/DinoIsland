# models
> Code-built 3D models shared by the rest of the client: the model kit (shared materials and shape helpers), the player character, weapons, hands, fruit and the site props; dinosaurs and firearms live in subfolders.

## Files
- `kit.js` — the model kit: shared materials `MAT` (standard, glossy, glow), `WIND` uniforms + `windMaterial` (keeps a shader patch already on its base material, e.g. surface detail), and shape helpers (`deform`, `paint`, `place`, `part`, `merge`, `mesh`, `tube`, `blob`, `spike`, `limb`, `eye`, `wrap`, `rockGeometry`, `smoothNormals`, `prep`, `jitter`).
- `playerModel.js` — `PlayerModel`: rigged, procedurally animated co-op explorer with outfit slots (hats, tops, pants from `shared/outfits.js`) and held weapons/tools/firearms.
- `weapons.js` — cached spear, bow (+ string), arrow, trap (open/sprung), meat and knife geometry; `BOW_REST`, `ARROW_TIP_Y`; `make*` mesh helpers.
- `hands.js` — `handGeometry`: grip-centred first-person hands.
- `fruit.js` — fruit geometry/material per type (`berry`, `mango`, `dragon`), `FRUIT_GLOW`, `makeFruitMesh`.
- `dino/` — dinosaur models and animation (own `package-info.md`).
- `firearms/` — pistol and rifle models (own `package-info.md`).

### props/
- `props/common.js` — helpers for site props: 3D noise (`noise3`, `fbm3`), `roundedBox`, `orient`, `groundIt`, SDF mesher (`sdfMesh`, `sdfRay`), `gridNormals`, cached glow/double-sided/additive materials.
- `props/boat.js` — `buildBoat(b)`: wrecked or repaired boat with relic sockets; `{ group, setRepaired, setParts, update }`.
- `props/cave.js` — `buildCave(c, biome)`: SDF rock dome cave with entrance, biome dressing, crystals and light.
- `props/springCave.js` — `buildSpringCave(s, biome)`: grotto the waterfall pours from; re-exports spring constants and `springSdf`.
- `props/ruins.js` — `buildRuins(r, biome)`: stone plaza, pillars, arch, altar; re-exports `RUINS_ALTAR_TOP`.
- `props/nest.js` — `buildNest(n)`: twig nest with eggs and a free centre for the golden egg relic; `NEST_EGG_Y`.
- `props/relics.js` — boat-part relic models: `relicModel`, `relicMesh` (hovering pickup with beam), `relicGlow`, `relicHeight`.
- `props/volcano.js` — `buildVolcanoFx(v)`: smoke plume, embers, glow haze and crater light.

## Entry points
- `kit.js` is imported almost everywhere in `client/world/`, `client/entities/`, `client/player/` and `models/dino/`; `core/game.js` advances `WIND.uTime` each frame.
- `PlayerModel`: `entities/remotePlayers.js`, `ui/wardrobe.js`, `player/weapon-preview.js`.
- `weapons.js`: `entities/items.js`, `entities/projectiles.js`, `player/viewmodel.js`, `player/actions.js`, `world/base.js`, `PlayerModel`.
- `hands.js`: `player/viewmodel.js`. `fruit.js`: `entities/items.js`, `player/viewmodel.js`, `world/fruitPlants.js`.
- Props: `world/sites.js` (boat, caves, ruins, nest, volcano); `entities/relics.js` (`relicMesh`); `props/boat.js` uses `relicModel`.
- Tests: `test/props.test.js`, `test/weapons.test.js`, `test/outfits.test.js`, `test/firearms.test.js`.

## Rules
- Style: soft, smooth, vertex-coloured shapes with the shared `MAT` materials and no textures (kit workflow: deform, paint, place, merge).
- Geometry built once per type is cached and shared; cached geometry/materials are marked with `retainResource` (`core/resources.js`) so island disposal (`disposeIslandScenes`) does not free them. New caches must do the same.
- Props whose shape has a collider take their dimensions from `src/shared/` so the mesh matches the collision: boat from `shared/boatShape.js`, cave from `shared/caveShape.js`, ruins from `shared/ruinsShape.js`, spring cave from `shared/springShape.js`, relic kinds from `shared/relics.js`.
- Models face -Z (player character and dinos); props document their local frame and API in the file header.
- Models only build and pose meshes; they hold no game state and do not talk to the network.

## Not here
- Placing models in the island scene: `client/world/` (static) and `client/entities/` (server-owned).
- Shape/collider tables: `src/shared/*Shape.js`.
- Vegetation, rocks and hut building pieces: `client/world/veg/`, `client/world/rocks.js`, `client/world/hut/` (props borrow some of them).
- First-person viewmodel logic: `client/player/viewmodel.js`.
