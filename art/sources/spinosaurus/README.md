# Spinosaurus source

`spinosaurus.blend` builds the whole Spinosaurus from an empty scene: run the `spbuild` text block (it
writes `assets/models/dinos/spinosaurus.glb` relative to the .blend). `scripts/` mirrors the text blocks
for review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b spinosaurus.blend --python-expr "import bpy; exec(bpy.data.texts['spbuild'].as_string(), {})"`

While iterating in live Blender, `91_spdev.py` reloads every `scripts/*.py` into its text block first and then
execs the steps named in `SPDEV_STEPS`; `92_spdiag.py` runs the checks (`SPDIAG`: ground, steps, low, sheets).

Brief: `docs/newDinos/new-dinos.md` (third entry: dark teal body, burnt-orange sail, pale sandy underside;
aggressive bites and claw attacks) and `docs/newDinos/Spinosaurus.png` (proportions, banded sail, dark
spotting, orange stripe over the snout and neck). Proportions measured from the reference at ~9 mm per pixel:
authored at real scale (12.8 m long, 5.74 m to the sail top, facing -Y), 30 fps clips. The body is kept
darker and bluer than the light-teal stego so the two never read alike. Owner brief: "has to look really
dangerous" - slit amber eyes under a heavy brow shelf with raking hornlets, black eye mask, red gum line,
uneven ivory fangs with the biggest in the snout rosette, long arms with big black sickle claws.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `views`, `export`, `eyes`, `mouth` | shared dino-blender-creator helpers (copies of the skill scripts) |
| `splib` | palette `SPP`, `sphide()` (countershade + spot clusters + tail saddles + speckle) |
| `spbody` | trunk (long tail -> deep narrow body -> S-neck ending inside the skull) as one spline tube; massive hind legs with three thick toes, long powerful arms with three fingers, all as separate tubes |
| `sphead` | long crocodile skull (brow shelf, sunk eye socket, jaw muscles, nasal crest, lip lifted over the rosette fangs), lower jaw (`mouth.jaw_prof` + trough + tongue), slit-pupil living eyes (`Ht .34, Hb .48, tilt .38`), conical interlocking teeth rooted in the measured lip lines |
| `spfuse` | skull + jaw + neck fused into ONE mesh (`fuse_head`), then every limb part unioned in on its own (the joined set intersects itself) with one fillet pass (wide at the body, narrow at toes/fingers) |
| `spparts` | sail (thin membrane on the back, base ray-cast onto the body, scalloped top with a bump per spine, ridged spines), dorsal scutes on the neck and tail, brow hornlets, hand and foot claws |
| `sppaint` | vertex colours for every part, two materials (skin; gloss for teeth and claws) |
| `sprig` | armature: Body, Torso, Neck1-3, Head, flipped Jaw, Tail1-6, theropod IK legs, FK arms (ArmUp/ArmLow/Hand) |
| `spskin` | spine distance weights, crisp limb weights only outside the trunk tube, Head/Jaw from the fuse regions (no cheeks), sail and scutes copy the back skin's weights, teeth/eyes/hornlets rigid on Head/Jaw, claws on Hand/BackToes, max 4 influences |
| `spanim` | Idle (5 s: looks around with holds, sniffs, jaw clack, claws flex), Walk (stalking, head low and steady), Run (charge: lean, neck forward, jaws ajar, tail stiff, arms up), Attack (1.1 s: rear back with jaws open and arms raised 0-0.3, lunge, snap + claw slash ~0.45, head shake), Roar (2 s loop: head up, jaws wide, arms spread, rumble), Death (2.2 s: staggers, collapses forward onto the belly, slight roll, arms splay on the ground; no side roll because of the sail) |
| `spexport` | samples clips, deform-only export rig, `Spinosaurus_*` actions, GLB |
| `spbuild` | master: clears the scene, sets 30 fps and runs everything above |

Measured (`check_glb.mjs ... --length 14`): height 6.262 m at 14 m length, walk stride 3.518 m, run stride
6.491 m, max knee step 0.169 rad per 1/60 s at 1.6 Hz cadence (limit 0.4), 51,563 triangles, 3,257 vertices
follow the Jaw. All clips keep every vertex above the ground (`ground_report` min z >= 0.017).

## Not integrated into the game yet

The GLB is not registered: a species needs `GLB_DINOS` (`model('spinosaurus', 'Spinosaurus', 6.262, 14, 3.518,
6.491, true)`, bones = raptor theropod bones with `neck: ['Neck1', 'Neck2', 'Neck3']`, `tail: Tail1-6`,
`clips.roar = 'Spinosaurus_Roar'`, `maxCadence` 1.6), a `SPECIES` view entry with a procedural fallback, `CONFIG`
species data and AI (aggressive near rivers/swamps, bites + claw attacks, rush from shallow water), spawns,
`art/asset-manifest.json`, `test/dino-glb.test.js` (`authored` list + `sourceTriangles`) and `extraHitZones`
(snout, sail, arms, tail) measured with `hit_coverage.mjs` until >= 95 %.
