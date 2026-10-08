# Crystal Plodder source

`crystal-plodder.blend` builds the whole Crystal Plodder from an empty scene: run the `pbuild` text block (it
writes `assets/models/dinos/crystal-plodder.glb` relative to the .blend). `scripts/` mirrors the text blocks for
review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b crystal-plodder.blend --python-expr "import bpy; exec(bpy.data.texts['pbuild'].as_string(), {})"`

Authored at real scale (about 6.9 m in Blender, facing -Y); the game fits it to 6.0 m long, 2.06 m high.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `views`, `export` | shared dino-blender-creator helpers (same as the other species) |
| `eyes`, `mouth` | skill helpers: living eyes and the lower jaw (keel, lip, trough, tongue, cheeks) |
| `plib` | palette `PP` (slate hide, lichen, pale belly, cyan/violet crystals), `psk()` skin, `p_limb()` leg tube |
| `pbody` | trunk (club tail -> broad barrel -> low neck) as one spline tube, four short pillar legs, toenails |
| `phead` | small low head with a horn beak (the stego loft, shorter and wider), gentle round eyes |
| `pfuse` | skull + jaw + neck fused into ONE mesh, legs boolean-unioned in with a fillet |
| `pparts` | armour studs, flank spikes, club studs and 17 crystal clusters (hexagonal prisms with pointed caps, seeded) |
| `ppaint` | vertex colours; the crystals are joined into one mesh with its own material `PlodCrystal` (the client shows it unlit) |
| `prig` | armature: Body, Shoulders, Neck1-2, Head, flipped Jaw, Tail1-6, four IK legs |
| `pskin` | spine distance weights, crisp legs (only outside the trunk tube), feet pads rigid on the foot bone, Head/Jaw from the fuse regions, rigid studs/crystals/spikes/eyes/nails, max 4 influences |
| `panim` | Idle (5 s, looks around, licks the floor), Walk, Run (heavy trot), Attack (1.2 s club swing, strike 0.43-0.70 s), Hurt, Roar, Death |
| `pexport` | samples the clips, deform-only rig, `CrystalPlodder_*` actions, GLB |
| `pbuild` | master: clears the scene and runs everything above |
| `pshots` | review helper only (ortho views + clip sheets) |

Glow: the GLB has three primitives (skin, `PlodCrystal`, gloss). `GLB_DINOS['crystal-plodder'].glow` tells `glbDino.js`
to replace `PlodCrystal` by an unlit vertex-colour material, so the crystals stay readable in the dark without a light.

Gameplay fit (`src/shared/config.js`, `src/sim/ai/crystalPlodder.js`): `SWEEP` in the brain is the angle range of the club
around the hip pivot per clip time, measured from the Attack clip (club vertices, hip pivot at y = 0.7 in Blender, scale
0.898). Re-measure if you re-animate Attack. Walk stride 1.0 m, Run stride 1.8 m, `maxCadence` 1.9 (knee speed limit).
