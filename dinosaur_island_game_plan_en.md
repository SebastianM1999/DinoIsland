# Dinosaur Island – Game Plan

## 0. Visual References – Read First

> **For AI agents:** before any visual work (models, materials, colors, lighting, environment, HUD/UI, icons, VFX), **open and look at the relevant images in `inspiration/`**. Don't work only from the text descriptions in this plan. These images define the target look. When the text and an image disagree on *looks*, match the image. When they disagree on *gameplay, scope, or camera*, follow this plan.

| File | Use it for |
|---|---|
| `inspiration/game-concept-art-and-artstyle.png` | Overall art style, island look, color mood, the hut, and a feel for the core loop (tracking, hunting, looting, returning). |
| `inspiration/model-art.png` | Player character models (front and side), outfits, backpacks, player color palette, and front/side views of Velociraptor, Brachiosaurus, and T-Rex. |
| `inspiration/3-dino-models.png` | Dinosaur proportions, faceted low-poly shapes, coloring and stripes, environment backdrops (cliffs, waterfall, volcano). |
| `inspiration/HUD-art.png` | HUD/UI component sheet: status bars, compass, minimap, quest log, inventory, equipment, hotbar, interaction prompt, item-received toast, tracking hint, team list, crafting panel, status effects. |
| `inspiration/ingame-FPS-pov.png` | **Main in-game target:** first-person view, held weapon, HUD layout on screen, crosshair, beach/island scene. |
| `inspiration/ingame-UI-no-BG.png` | Exact HUD placement and styling without the scene behind it. Use it to position the HUD elements. |
| `inspiration/ingame-UI.png` | HUD layout and co-op nameplates. **Note:** this image shows a third-person camera. That's only for reference; the game is first-person (see section 3). |

Notes:
- The text in the images is German (e.g. "Jagdhütte" = hunting hut, "Inventar" = inventory). Some features shown in the art (e.g. the crafting panel, resource gathering with an axe) may not be in scope. Only build what this plan defines.
- UI style shown in the images: dark navy panels with brush-stroke edges, rounded chunky font, colorful flat icons.

---

## 1. Goal

A small, polished **1–4 player co-op dinosaur demo** for Steam.

The core loop:

**Explore → find tracks → prepare → hunt dinosaurs → secure loot → return to the hut together → next expedition**

The scope is deliberately kept small so that the entire game can be generated, extended, and maintained by AI.

---

## 2. Tech Stack

### Game

- **JavaScript (ES Modules)**
- **HTML5**
- **CSS3**
- **Three.js**
- **WebGL/WebGL2**
- **GLSL shaders**
- Web APIs for input, Pointer Lock, audio, etc.

### Deliberately not used

- TypeScript
- Vite
- React/Vue
- Unity/Unreal/Godot
- Physics framework
- Complex asset pipeline

Three.js is the central 3D library. The project should be developable as directly as possible, without a build system.

### Multiplayer

- 1–4 players
- WebSocket-based communication
- Multiplayer is **part of the architecture from the start**, not a later add-on.
- The shared world, dinosaurs, and important gameplay state are synchronized.

### Steam

The game is first developed and tested as a regular web application. The finished version is then packaged as a desktop application for Steam.

---

## 3. Camera and Perspective

The game is **entirely first person / FPS perspective**.

The local player mainly sees:

- hands/arms
- spear, bow, or the currently equipped tool
- HUD
- the game world from a first-person view

Other players are shown as low-poly co-op characters (see section 5).

There is **no third-person player view**.

---

## 4. Art Style

The style is a **modern low-poly / cartoon look** – simple shapes, but rich, polished, and "detailed" in the way it is built, colored, and lit.

- clean, faceted low-poly geometry
- flat/cel shading with visible facets
- no thick black outlines
- strong, readable silhouettes
- stylized proportions (big heads, chunky feet, expressive eyes)
- detail comes from **many well-placed shapes and color zones**, not from dense meshes or textures

### Colors

The color palette should be **poppy, vibrant, and cartoony**:

- strong sky blue
- bright turquoise for water
- strong greens for vegetation
- warm orange/yellow tones
- strong red/brown tones
- light cream tones
- dark blue/violet tones for contrast

The scene should feel friendly and colorful, not realistic or dark.

### Lighting

Even though the models are low-poly, the rendering should look high quality.

For this we use:

- warm directional/sun lighting
- hemisphere/sky lighting (blue from above, warm bounce from the ground)
- soft shadow mapping (PCF soft shadows, tuned shadow camera around the player)
- ACES filmic tone mapping and sRGB output
- stylized materials
- atmospheric, slightly blue distance fog
- stylized gradient sky with low-poly clouds
- good water rendering (turquoise shallows, deeper blue, foam at the shore, gentle waves)
- GLSL shaders for key effects (water, wind sway in grass/leaves, waterfall)
- subtle ambient occlusion / contact shadows under characters, rocks, and trees
- optional subtle bloom for highlights (fruit glow, campfire, sun on water)

**Goal:** simple models, but a surprisingly beautiful overall image – it should look like the concept art.

---

## 5. Model Quality – "Low-Poly but Detailed"

This is a key requirement. Models must look **low-poly, but lovingly made and rich in detail** – not like primitive boxes and spheres stuck together.

### General rules

- **Built from shaped geometry, not raw primitives.** Start from primitives, then move vertices to shape them: tapered limbs, rounded bellies, curved necks, pointed snouts, flared feet. No plain cubes or perfect spheres left unmodified.
- **Faceted look:** use `flatShading: true` so each face catches light differently. The facets *are* the detail.
- **Enough segments for smooth shapes:** body parts use enough segments that curves read well (e.g. 8–12 radial segments for torso and neck), while still staying clearly low-poly.
- **Vertex colors for color zones** instead of textures:
  - **countershading:** darker back, light cream belly and throat (as in the reference images)
  - **stripes/bands** on backs and tails (darker tone of the main color)
  - darker tips on claws, spikes, and plates
- **Small detail pieces** that make models feel crafted:
  - separate claws on hands and feet
  - individual teeth (small cones) in open jaws
  - nostrils, brow ridges, cheek bumps
  - eyes with a colored iris, dark pupil, and a small white highlight
  - eyelids/brows that can move for expression
- **Per-model polygon budget** (guideline): players ~1–2k tris, small dinos ~2–4k, large dinos ~4–8k. The budget is spent on silhouette and features, not on flat surfaces.
- **Models are built procedurally in code** (reusable model-builder functions), so AI can create and tweak them without a separate asset pipeline. Optionally allow loading `.glb` files later.

### Rigging for animation

- Every creature is built as a **hierarchy of joints** (pelvis → spine → neck → head → jaw; hips → thigh → shin → foot → toes; tail made of 5–8 segments).
- Joints are placed at anatomically sensible pivot points so rotations look natural.
- Body parts overlap slightly at joints so no gaps appear during movement.
- Idle animations: breathing (chest scale), blinking, small head turns, tail sway.

### Player characters (see `model-art.png`)

- small, chunky explorer figures with a big round head and simple black oval eyes
- skin color per player: green, pink, yellow, blue
- different hats: brown ranger/safari hat, white cap with orange detail, etc.
- short-sleeved shirt, cross-body strap, belt with buckle
- brown shorts, white socks, brown boots
- a backpack with pocket and straps
- in first person: stylized hands/sleeves in the player's color holding the tool

### Dinosaur looks

| Dinosaur | Colors | Key details |
|---|---|---|
| **Brachiosaurus** | blue-violet with cream belly and neck underside | very long curved neck, small head with nostril bump, thick pillar legs, long tapering tail |
| **Stegosaurus** | olive/moss green with cream belly, orange-red plates | two rows of alternating back plates, four tail spikes, small low head, heavy arched back |
| **Velociraptor** | orange with dark-brown stripes, cream belly | slim body, long stiff tail, big sickle claw on each foot, grasping hands, yellow eyes |
| **Pteranodon** | teal/turquoise wings, cream body, red-orange head crest | large membrane wings with visible finger bone, long pointed beak, backswept crest |
| **T-Rex** | red-orange with dark stripes, cream belly | huge head, big jaw with many teeth, tiny arms, powerful legs, heavy tail |

### Props and world objects

- **Hut:** log cabin with visible logs, plank roof, chimney, door and windows, a flag with a dinosaur footprint, campfire, crates, workbench, and a signpost (see concept art).
- **Weapons:** spear with wooden shaft, wrapped grip and stone tip; bow with a curved limb, grip wrap, and string; arrows with feathered fletching.
- **Trap:** wooden frame with sharpened stakes and rope.
- **Vegetation:** layered low-poly tree crowns, palms, ferns, grass tufts that sway in the wind.
- **Rocks and cliffs:** faceted rocks with slight color variation and some green on top.
- **Fruit:** clearly shaped and glowing slightly (see section 10).

---

## 6. Animation

The dinosaurs must **look good while moving**.

Special attention to:

- clean joints
- sensible body segments
- natural leg movement
- stable foot contact (no sliding feet)
- smooth walk/run cycles, with speed matched to movement
- head and tail movement with a slight delay (follow-through)
- body bob and weight shift during walking
- smooth transitions (blending) between animations
- for the Pteranodon: smooth wing flaps, gliding phases, and dive attacks

No stiff figures and no visible "robot movements".

Animations are **procedural** (sine-based cycles, simple IK for foot placement where needed) and should be simple but smooth and convincing.

---

## 7. Game World

A small dinosaur island with:

- beach
- jungle
- hills
- water
- waterfall
- small lake
- rocks and cliffs (Pteranodon nesting sites)
- trees and bushes
- fruit bushes and fruit trees
- a central hunting hut

The world gets natural borders from the sea, rocks, jungle, and terrain.

No huge open world.

---

## 8. Dinosaurs

### Brachiosaurus

- peaceful
- slow
- wanders around
- small herds
- flees when in danger
- the main hunting target of the demo

Loot:

- meat
- hide

### Stegosaurus

- aggressive and territorial
- medium-sized, heavy, fairly slow
- grazes in small groups in clearings and meadows
- gets angry when players come too close or attack it
- charges at players in short bursts
- turns sideways and strikes with its spiked tail (high damage, knockback)
- its back plates protect it from above and behind – **weak spots: flank and neck**
- ideal for co-op: one player draws its attention, the others attack from the side

Loot:

- meat
- hide
- plates

### Velociraptor

- fast
- alert
- aggressive
- small groups
- chases players
- can be influenced by bait and traps

Loot:

- meat
- teeth

### Pteranodon (flying reptile)

- aggressive
- nests on cliffs and rocks, circles in the air above the beach and hills
- attacks in a dive, preferring players who are alone or injured
- can knock players down
- tries to **steal carried meat** and fly away with it
- barely reachable with the spear while airborne – **bow and arrow is the main weapon against it**
- lands briefly after an attack and is then vulnerable to melee as well
- low health

Loot:

- meat
- claws

### T-Rex

- rare
- very large
- patrols
- roars
- can chase players
- mainly exists to create danger and chaos

The T-Rex is not a regular hunting target in the first demo.

---

## 9. Hunting

The demo needs four tools:

- **Spear** – melee, high damage, can also be thrown and picked up again
- **Bow and arrow** – ranged, lower damage per hit, ideal against the Pteranodon and for luring/provoking dinosaurs from a safe distance
- **Trap**
- **Meat bait**

### Bow and Arrow

- hold to draw the bow, release to shoot
- arrow flight with simple ballistics (arc due to gravity)
- limited arrow supply (e.g. 12 arrows)
- arrows can be collected again after shooting (from the ground or from a killed dinosaur)
- arrows are refilled at the hut
- hits on weak spots (e.g. head, Stegosaurus flank) deal extra damage

Gameplay:

1. Find dinosaur tracks.
2. Follow the dinosaur.
3. Observe its position and behavior.
4. Prepare a trap or bait.
5. Attack as a team – up close with the spear, from a distance with the bow.
6. Defeat the dinosaur.
7. Pick up the loot.
8. Return to the hut together.

---

## 10. Food and Healing

Players can **find fruit** while out exploring to heal themselves. There are **3 fruits**:

| Fruit | Where to find it | Frequency | Effect | Look |
|---|---|---|---|---|
| **Red Berries** | bushes along the jungle edge and paths | common | small heal (+15 HP) | cluster of shiny red faceted berries on a green bush |
| **Sun Mango** | trees in the jungle | medium | medium heal (+35 HP) | chunky orange-yellow mango with a leaf, hanging from branches |
| **Blue Dragon Fruit** | hidden spots, e.g. at the waterfall or on hills | rare | large heal (+70 HP) plus a short heal-over-time | spiky blue-violet fruit with a soft glow and tiny sparkles |

Rules:

- fruits are collected and carried in the inventory (limited amount, e.g. max. 5 fruits)
- eating is done with a key, with a short animation (the player is somewhat vulnerable while eating)
- fruits regrow at their locations after some time
- fruits can be given to co-op teammates
- fruits are easy to spot: large, bright, glowing shapes in the cartoon look

This makes exploring the island worthwhile, and expeditions can last longer without constantly returning to the hut.

---

## 11. Co-op

Co-op is a central part of the game.

Players can naturally take on different roles:

- Tracker
- Trapper
- Bait
- Hunter (melee with spear)
- Archer (ranged with bow)
- Scout
- Gatherer (fruit, arrows)

But there are no fixed classes.

Players can:

- track dinosaurs together
- prepare traps
- distract dinosaurs
- fight together
- protect each other from Pteranodon attacks
- carry and protect loot
- share fruit and heal other players
- flee from the T-Rex together

Maximum of **4 players**.

---

## 12. Loot and Risk

Dinosaurs drop:

- meat
- hide
- teeth
- plates
- claws

Loot must actually be picked up and carried back to the hut.

Carried loot can slow the player down.

Pteranodons can steal carried meat.

When a player dies, their carried loot (including fruit) is lost and they respawn at the hut.

This creates a simple risk/reward loop.

---

## 13. Hut

The hut is the safe base.

There, players can:

- drop off loot
- heal
- refill arrows
- view missions
- start expeditions
- later receive simple upgrades

For the first demo, a very simple base function is enough.

---

## 14. HUD

Minimal and clear (see `HUD-art.png` and `ingame-UI.png`):

- health
- current objective
- compass
- small minimap
- equipment
- arrow count
- fruit in inventory
- resources
- co-op players
- interaction prompts

The HUD uses the same colorful, simple cartoon look as the world: dark semi-transparent panels with brush-stroke edges, rounded friendly font, simple white icons.

---

## 15. Demo Mission

The first complete mission:

> **Find a Brachiosaurus. Track it. Hunt it. Collect the loot. Return to the hut.**

Along the way, the Stegosaurus, Raptors, Pteranodons, and the T-Rex create danger – fruit keeps the team alive.

This completes the basic gameplay loop.

---

## 16. Development Phases

### Phase 1 – Foundation

- HTML/CSS/JavaScript
- Three.js
- rendering
- FPS camera
- Pointer Lock
- WASD
- sprint
- jump
- gravity
- basic collision
- central config file for tunable values (health, damage, speeds, arrow count, fruit limit)

### Phase 2 – Visuals and Island

- low-poly island
- water
- sky
- fog
- lighting, tone mapping
- shadows
- shaders
- hut
- vegetation
- fruit bushes and fruit trees
- rocks and cliffs

### Phase 3 – Multiplayer

Directly as part of the game:

- server (Node.js + WebSocket, server is authoritative for world, dinosaurs, and loot)
- lobby/join
- 1–4 players
- player synchronization
- spawn/respawn
- disconnect handling
- player character models and simple remote player animations

### Phase 4 – Brachiosaurus

- detailed low-poly model (section 5)
- joints and animations
- wandering behavior
- flee behavior
- herd
- network synchronization

### Phase 5 – Hunting and Healing

- spear
- bow and arrow (drawing, ballistics, collecting arrows)
- hits
- damage and weak spots
- trap
- bait
- dinosaur death
- loot
- pickup
- fruit: collecting, eating, regrowing, sharing

### Phase 6 – Aggressive Dinosaurs

- Raptor model, AI, and attack
- Stegosaurus model: territorial behavior, charge, tail strike
- Pteranodon model: flight AI, circling, dive attack, stealing meat, landing
- T-Rex model, patrol, and chase
- audio/feedback

### Phase 7 – Game Loop

- hut
- loot drop-off
- arrow refill
- mission
- respawn
- death
- carry system
- demo completion

### Phase 8 – Polish

- improve animations
- improve model detail
- improve lighting
- improve shaders
- particles
- sound
- music
- UI polish
- performance
- multiplayer testing

### Phase 9 – Steam

- desktop package
- Windows build
- Steam integration/upload
- testing on target systems
- final demo builds

---

## 17. Core Principle

The project deliberately stays small:

**Low-poly but detailed models + strong colors + beautiful lighting + smooth animations + chaotic 1–4 player co-op.**

The most important playable vertical slice is:

**2–4 players start at the hut → head out together → find a dinosaur → hunt it with spear and bow → heal with fruit → collect loot → return to the hut together.**

If this loop is fun, we have the foundation for the complete game.
