# Dilophosaurus source

`dilophosaurus.blend` builds the whole Dilophosaurus from an empty scene: run the `dlbuild` text block (it
writes `assets/models/dinos/dilophosaurus.glb` relative to the .blend). `scripts/` mirrors the text blocks for
review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b dilophosaurus.blend --python-expr "import bpy; exec(bpy.data.texts['dlbuild'].as_string(), {})"`

While iterating in live Blender, `91_dldev.py` reloads every `scripts/*.py` into its text block first and then
execs the steps named in `DLDEV_STEPS`; `92_dldiag.py` runs the checks (`DLDIAG`: ground, steps, low, sheets).

Brief: `docs/newDinos/new-dinos.md` (fourth entry: small-medium predator, two thin head crests, slim, long tail;
golden-yellow body with dark brown markings, bright red-orange crests; hit-and-run attacks) and
`docs/newDinos/Dilophosaurus.png` (proportions, fan-shaped ribbed crests, blotchy saddles). Proportions measured
from the reference at ~5 mm per pixel: authored at real scale (7.0 m long, 3.08 m to the crest tops, facing -Y),
30 fps clips. Built on the Spinosaurus pipeline (`art/sources/spinosaurus`).

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `views`, `export`, `eyes`, `mouth` | shared dino-blender-creator helpers (copies of the skill scripts) |
| `dllib` | palette `DLP`, `dlhide()` (countershade + dark brown saddles + spot clusters; never the raptor's stripes) |
| `dlbody` | trunk (whip tail -> slim body -> S-neck ending inside the skull) as one spline tube; slender hind legs with three toes, long arms with three fingers, all as separate tubes |
| `dlhead` | narrow skull with the kinked upper lip behind the snout tip, brow shelf, sunk eye socket, jaw muscles; lower jaw (`mouth.jaw_prof` + trough + tongue); slit-pupil living eyes (`Ht .36, Hb .5, tilt .36`); uneven recurved teeth rooted in the measured lip lines |
| `dlfuse` | skull + jaw + neck fused into ONE mesh (`fuse_head`), every limb part unioned on its own (EXACT without `use_self`: with it Blender 5.2 crashed in `meshintersect`) with one fillet pass |
| `dlparts` | two crests (thin fan plates side by side on the skull roof, rounded half-disc outline, scalloped rim with a bump per rib, slight outward splay), neck/back/tail scutes, hand and foot claws, and the **neck frill**: a ribbed display fan on each side of the neck (6 ribs, scalloped rim, pointed upper outer corner), modelled OPEN as the rest pose, attributes `fk` (rib coordinate) and `ht` (radial) |
| `dlpaint` | vertex colours (golden hide, dark mask, red gums, crests red-orange with dark rib bands and a warm rim; frill yellow at the root -> orange -> red rim with dark rib bands and a spotted dark ring), two materials |
| `dlrig` | armature: Body, Torso, Neck1-3, Head, flipped Jaw, Tail1-6, theropod IK legs, FK arms, one bone per frill rib (`FrillL0-5`, `FrillR0-5` on Neck3) |
| `dlskin` | spine distance weights, crisp limb weights outside the trunk tube, Head/Jaw from the fuse regions, scutes copy the back skin, crests/teeth/eyes rigid on Head/Jaw, claws on Hand/BackToes, frill membrane blended between its two neighbouring rib bones by `fk` (root ring on Neck3) |
| `dlanim` | Idle (5 s: quick bird-like head turns with holds, crest-flash bob, jaw snap), Walk (springy), Run (flight phase, lean, tail straight back), Attack (1.0 s hit and run: coil 0-0.25, dart + snap ~0.4, hop back 0.55-0.85), Roar (2 s loop: rears up, frill fully spread and rattling, turns the crests side to side, jaws wide, hissing rattle), Hurt (0.9 s, clamps: flinch, hiss, frill snaps open by 0.12 and stays open while hurt), Death (2 s, onto the belly: a side roll would bury the crests; the frill flares with the cry and folds limp). `dl_frill(f)` folds the frill flat along the neck (f=0, Idle/Walk/Run) or spreads it (f=1); Attack opens it during the coil (0.1-0.2) and holds it through the strike |
| `dlexport` | samples clips, deform-only export rig, `Dilophosaurus_*` actions, GLB |
| `dlbuild` | master: clears the scene, sets 30 fps and runs everything above |

Measured (`check_glb.mjs ... --length 7`): height 3.083 m at 7 m length, walk stride 1.995 m, run stride
4.014 m, max knee step 0.235 rad per 1/60 s at 2.6 Hz cadence (limit 0.4), 48,616 triangles, 2,616 vertices
follow the Jaw. All clips keep every vertex above the ground (`ground_report` min z >= 0.01).

## Not integrated into the game yet

The GLB is not registered: a species needs `GLB_DINOS` (`model('dilophosaurus', 'Dilophosaurus', 3.083, 7,
1.995, 4.014, true)`, bones = raptor theropod bones with `neck: ['Neck1', 'Neck2', 'Neck3']`, `tail: Tail1-6`,
`clips.roar = 'Dilophosaurus_Roar'`, `clips.hurt = 'Dilophosaurus_Hurt'` (GLBDinoAnimator plays it while `hurt > .5`), `maxCadence` 2.6), a `SPECIES` view entry with a procedural fallback,
`CONFIG` species data and AI (circle, lunge, retreat), spawns, `art/asset-manifest.json`,
`test/dino-glb.test.js` (`authored` list + `sourceTriangles`) and `extraHitZones` (snout, crests, arms, tail)
measured with `hit_coverage.mjs` until >= 95 %.
