---
name: map-design-rules
description: Art style and map/level design rules for Dinosaur Island. Read before creating or changing any model, prop, plant, rock, terrain, water, island layout, path, POI (cave, ruins, nest, waterfall, boat), collider or spawn. Defines the smooth, colorful, hand-crafted-looking procedural modelling pattern and the rules that make generated islands feel natural and never trap the player.
---

# Dinosaur Island – art style & map design rules

These rules are the source of truth for how the game looks and how islands are built.
They were set by the game's owner; follow them exactly. When a rule and a quick hack
conflict, the rule wins.

---

## Part 1 – Art style (the modelling pattern)

### 1.1 The look in one paragraph

Bright, friendly, chunky, **smooth** stylized 3D. Everything is built in code from
primitives and painted with **vertex colors only** (no textures, no image files).
Shapes are soft and rounded with exaggerated, readable silhouettes. Surfaces are never
one flat color: every surface carries 2–4 related tones that drift slowly across it,
plus small accents (moss, lichen, speckles, stripes). The result must read as
hand-crafted and rich in variety, like a toy diorama – **never low-poly, never faceted**.

### 1.2 Hard rules

1. **No visible triangles.** No flat shading anywhere (`flatShading` is forbidden).
   Curved surfaces must get enough segments and smooth normals. Only real corners
   (planks, cut stone, crates) may keep a crisp edge.
2. **Build with the model kit** (`src/client/models/kit.js`):
   `primitive → deform() → paint() → place()/part() → merge()`.
   - `merge()` welds normals across faces up to `CREASE` (72°) via `smoothNormals()`,
     so curved things are smooth and box corners stay sharp. Anything that does not
     go through `merge()` must call `smoothNormals(geo, crease)` itself.
   - `tube()` (bodies, trunks, necks, tails, limbs), `blob()` (ellipsoids), `limb()`,
     `spike()` and `rockGeometry()` already use high segment counts – use them.
   - Organic shapes that are later animated (dinos) need joint balls/overlaps so no
     gap or crease opens when they bend.
3. **No per-vertex random jitter** for organic shapes. Random per-vertex offsets create
   creases sharper than the crease angle and bring the faceted look back. Use
   **low-frequency lumps** instead: a few sines of the vertex direction, `valueNoise`/
   `fbm` at a scale of 1–3 bumps per object. Foliage clumps end with fully smooth
   normals (`smoothNormals(g, Math.PI)`).
4. **Materials:** use the shared `MAT.standard` / `MAT.glossy` / `MAT.glow`
   (vertex colors, smooth). Glow/emissive only for things that should glow (fruit,
   crystals, lava cracks, relic beams, fire). Keep material count low so instances batch.
5. **Instancing:** anything placed many times (trees, bushes, rocks, grass) is built
   once, cached, and drawn with `InstancedMesh`; per-instance variety comes from the
   instance color (`foliageTint()`, rock brightness) and scale/rotation/lean.

### 1.3 Color & texture – the part the owner loves

Variety is the signature of this game. Every model and surface must follow this:

- **2–4 tones per material zone**, blended smoothly by low-frequency noise
  (`fbm`/`valueNoise` at world or object scale), never random per face.
- **Value + hue drift:** shift lightness a little (±3–8%) and hue slightly (±0.02–0.04)
  across big surfaces so they never look flat (terrain speckle, rock bands, canopies).
- **Accents:** moss on upward faces (by normal.y), lichen spots, darker grooves,
  lighter tips, speckles on eggs, stripes on dinos. Accents are small and sparse.
- **Countershading** on creatures: lighter belly, darker back, soft gradient between.
- **Bark:** vertical grooves (slight radius modulation + darker vertex color), moss near
  the foot, lichen dots. Each tree species has its own bark hue.
- **Foliage:** 2–3 greens per tree plus occasional lime / teal / sunlit-yellow accents;
  top of a clump lighter, underside darker; per-instance tint via `foliageTint(hue)`.
- **Rocks:** 3 related stone tones drifting across the rock, darker at the foot, moss
  blended in on top (biome `rocks.moss`), warm/cool bands on cliffs.
- **Terrain** (`src/client/world/terrainMesh.js`) layers, in order: sea bed / river bed
  → biome grass family (grass, grassLight, grassDark, floor under jungle, high ground)
  → patchy hue variety → sand on beaches → layered cliff stone with warm/cool bands and
  mossy ledges on steep slopes → wet sand/mud banks → scorched ground near lava →
  worn, patchy trail dirt → fine speckle. Keep this layering when adding biomes.
- **Biome palettes** live in `src/shared/levels.js` (`terrain`, `rocks`, `sky`,
  `water` per biome). New content reads colors from the biome instead of hard-coding
  them, so the same model works on every island (jungle: saturated greens, warm sand,
  violet-grey stone; volcano: ash, basalt, dull olive, glowing orange).
- Water and lava use smooth analytic normals; lava has a bright core, darker drifting
  crust and glowing cracks.

### 1.4 Shapes & proportions

- Chunky, cute and readable from 50 m: big heads, thick trunks, rounded rocks, puffy
  canopies made of several overlapping smooth masses (bumpy silhouette, soft surfaces).
- Exaggerate the one feature that identifies a thing (T-Rex head, stego plates,
  bamboo segments, giant-tree buttresses, the boat's broken mast).
- Scale reference: player 1.8 m, door 2.4 m, raptor ~1.9 m tall, brachio ~11 m,
  giant jungle tree ~27 m, cave ~5.5 m high.

### 1.5 Budgets (triangles)

| Thing | Budget |
|---|---|
| Instanced tree | ≤ 4k (giant ≤ 8k) |
| Bush / plant | ≤ 2k |
| Rock variant | ≤ 3k |
| Prop (boat, cave, ruins, nest, spring cave) | ≤ 30k |
| Dinosaur | ≤ 60k |
| Player | ≤ 15k |

---

## Part 2 – Map & level design rules

The island is generated by `src/shared/island.js` (plan + height function), sampled
by `src/shared/terrain.js`, and populated by `src/shared/layout.js`. Every rule below
must hold for **every** seed – verify with scripts, not one screenshot.

### 2.1 Island structure

- One oblong island per level. Hut and spawn on the west beach, the wrecked boat on
  the east beach, the interior in between. The first island is a small tutorial
  island; the last one ends the game.
- Each island has its own biome identity (terrain palette, plants, rocks, sky, water,
  dinosaurs). Don't mix biome props.
- Varied relief: a main mountain, several hills and ridges, knolls so no area is flat.

### 2.2 Paths

- **Exploring off-road is allowed and expected.** Paths are a help, never a
  requirement; open terrain must stay walkable almost everywhere.
- Paths look **worn in, not painted**: varying width, patchy dirt that fades in and
  out, soft edges. Don't draw bright uniform bands.
- Paths are **never symmetrical or geometric**: no perfect spirals, circles or
  straight segments. Use smoothed curves with noise, uneven bends, a varying radius
  and slope. One path up a mountain is enough.
- Mountain paths keep a walkable grade (< `maxWalkSlope`) and are kept free of trees
  and rocks; the ground beside them blends softly into the slope (no deep trench).

### 2.3 Points of interest (caves, ruins, nest, waterfall, boat)

- POIs **blend into the landscape**; they are never lonely objects on a flat pad.
  - Caves are dug into the flank of a hill or mountain: slope rising behind and
    around, entrance facing outward, floor + approach flattened, rubble and boulders
    at the mouth (with matching rock colliders).
  - Ruins are overgrown: roots, vines, moss, half-buried rubble, collapsed pieces.
  - The nest sits in dense cover guarded by its dinosaurs.
  - The boat lies stranded on the beach with debris around it.
- A relic spot is always reachable, dry (no water/lava), clear of plants and rocks
  (reserve a circle), visible (glow beam), and its **hint text must match** where it
  really is.

### 2.4 Water

- **Rivers always flow downhill**: the surface height along the river never
  increases. They start at a spring/pool and end in the sea (or a lava pool).
- **Higher ground on both sides**, always: the carve function adds natural levees so
  the ground beside the water is above the surface (except at the mouth into the sea).
- Rivers are shallow enough to wade (depth < `maxWadeDepth`) so they never cut the
  island in two; a sandbank may sit mid-river.
- **Waterfalls are logical**: water comes out of a spring cave / grotto in a cliff
  face (a third of the way down the rock face), falls into a pool at the cliff foot,
  and the river leaves the pool. Never start a waterfall on a flat mountain top.
- Lava follows the same flow rules (from the crater notch downhill) and burns.

### 2.5 Never trap the player

- No pits, bowls or trenches with walls steeper than the walk limit and no way out.
- No gaps between colliders narrower than the player diameter + margin that the
  player can walk into but not through; merge or separate such colliders.
- Terrain steeper than `maxWalkSlope` cannot be climbed or jump-climbed (the player
  slides). Therefore every elevated place that matters must have a walkable route.
- The unstuck system (auto-detect + `U` key) is a safety net, not a design tool.

### 2.6 Colliders match visuals

- The collider is generated from the same numbers as the mesh (shared shape tables:
  `treeShapes.js`, `rockShapes.js`, `caveShape.js`, `ruinsShape.js`, `boatShape.js`).
  No invisible walls, no walking through solid things.
- Movement against colliders must slide smoothly – no jitter between two colliders.

### 2.7 Placement

- **Trees never float**: sink each tree by the height drop across its foot (roots and
  buttresses included) on slopes; no trees on steep cliffs, paths, water, lava, POI
  pads or relic circles.
- **Dinosaurs spawn clean**: on dry, walkable, not-steep ground, outside every
  collider for their radius; flyers above ground; respawns follow the same check.
- Rocks and plants keep spacing (the `occupied` / `free()` system in `layout.js`).

### 2.8 Difficulty & scale

- Later islands are bigger and harder (difficulty in `levels.js`). The tutorial island
  is small, calm and readable.

---

## Part 3 – Checklist before you finish

1. `npm test` passes (includes island/level/props/movement tests).
2. Run a rules script over many seeds (both levels, ≥ 15 variants each) that checks:
   river surface never rises, banks above water, relics dry and reachable, caves
   hosted in a flank, trees not floating, dino spawns valid. Add new rules to it.
3. Render a top-down PNG of a few islands (see the `islandmap` script pattern: sample
   `terrain.heightAt/waterLevelAt/lavaLevelAt` into a PNG with Node's zlib) and look.
4. Check in the browser (solo mode, `window.__game`): walk the paths, enter a cave,
   look at the waterfall, look for faceted surfaces and flat single-color areas.
5. Keep triangle budgets; no console errors.
