# Triceratops source

`triceratops.blend` builds the whole Triceratops from an empty scene: run the `tbuild` text block (it
writes `assets/models/dinos/triceratops.glb` relative to the .blend). `scripts/` mirrors the text blocks
for review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b triceratops.blend --python-expr "import bpy; exec(bpy.data.texts['tbuild'].as_string(), {})"`

While iterating in live Blender, `91_tdev.py` reloads every `scripts/*.py` into its text block first and
then execs the steps named in `TDEV_STEPS`, so the .blend always runs the reviewed files.

Brief: `docs/newDinos/new-dinos.md` (first entry) and `docs/newDinos/Triceratops.png`. Authored at real
scale (about 8.2 m long, 3.47 m tall in Blender, facing -Y), 30 fps clips.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `views`, `export` | shared dino-blender-creator helpers (copies of the skill scripts) |
| `eyes` | reusable "living eye" builder (candidate for the skill): ball in an almond lid opening (ball outside the opening = lid skin on the skin material), rolled lid rim (heavy upper, thin lower, per-species tilt), painted iris (limbal ring, streaks, glow ring, lid shadow), curved pupil disc (round or slit), two white catchlights |
| `tlib` | palette `TP` (dusty orange-brown hide, dark brown mottling, cream belly, rust-red frill, bone horns, grey beak), `thide()` |
| `tbody` | trunk (short tail -> barrel body peaking over the hips -> short thick neck) as one spline tube, four short pillar legs, grey hoof-nails (4 hind, 5 front) |
| `thead` | big wedge head: wide cheeks, deep snout, hooked parrot beak overhanging the lower beak, horn bosses, amber 'living' eyes (`eyes`) |
| `tfuse` | skull + jaw + neck fused into ONE mesh (`fuse_head`), legs union-filleted into the trunk (`union_fillet`) |
| `tparts` | cupped neck frill leaning back with forward-swept side lobes (reads from the side), 15 rim knobs, two long brow horns, nose horn, cheek horns |
| `tpaint` | vertex colours for every part, two materials (skin, gloss) |
| `trig` | armature: Body, Shoulders, Neck1-2, Head, flipped Jaw, Tail1-6, four IK legs |
| `tskin` | spine distance weights, `limb_weights` per leg, Head/Jaw from the fuse regions, frill/horns/knobs/eyes rigid on Head, nails on the feet, max 4 influences |
| `tanim` | Idle (5 s, look-around, snort, graze + chew), Walk (lateral sequence), Run (the charge: bounding rotary gallop, one big rock per stride: hind push nose-up while both front feet are in the air, front landing nose-down and sinking; roll/yaw and tail whip, the head counter-rotates so the horns stay aimed low), Attack (1.2 s horn thrust: wind-up 0-0.36, shove with a front-foot stomp step ~0.45, hooking toss up ~0.55, settle), Death (2 s, collapse onto the belly, legs splayed) |
| `texport` | samples clips, deform-only export rig, `Triceratops_*` actions, GLB |
| `tbuild` | master: clears the scene, sets 30 fps and runs everything above |

Measured (`check_glb.mjs ... --length 8.2`): height 3.47 m at 8.2 m length, walk stride 1.519 m, run
stride 3.616 m, max knee step 0.34 rad per 1/60 s at 2.6 Hz cadence (limit 0.4; front legs peak at 92 % reach in the run), 56,384 triangles. All clips keep
every vertex at or above the ground (`ground_report`, min z >= -0.005).

## Not integrated into the game yet

The GLB is not registered: a species needs `GLB_DINOS` (catalog numbers above, bones `jaw: 'Jaw'`,
`neck: ['Neck1', 'Neck2']`, `spine: ['Body', 'Shoulders']`, `tail: Tail1-6`, `maxCadence` 2.6), a
`SPECIES` view entry with a procedural fallback, `CONFIG` species data and AI (the charge / horn knockback
from the brief), spawns, `art/asset-manifest.json`, `test/dino-glb.test.js` (`authored` list +
`sourceTriangles` 53984) and `extraHitZones`: the generic joint spheres cover only ~17 % of the surface
without species zones, so measure head/frill/horn/leg/flank spheres with `hit_coverage.mjs` until >= 95 %.
The horn-thrust hitbox should be measured from the Attack clip like `src/sim/ai/stego.js` `SWEEP`.
