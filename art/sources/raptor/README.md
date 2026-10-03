# Velociraptor source

`raptor.blend` is the master file. Its text blocks build the whole raptor from an
empty scene; `scripts/` holds the same code as `.py` files for diffs and review
(the `.blend` text blocks are what runs; keep both in sync).

| Script | Builds |
| --- | --- |
| `rlib` | helpers: lofts, blobs, curved horns, palette `P`, `skin()` countershading/stripes, `paint()` |
| `eyes`, `mouth` | skill helpers: living eyes (slim slanted lid opening, slit pupil, catchlights) and lower jaw (jawline keel, inward lip the lower teeth root in, mouth trough, tongue) |
| `rbody` | body/neck/tail/legs/arms from a skin-modifier skeleton (node table `N`) |
| `rhead` | head + lower jaw from cross-section profiles (`HEAD_SECS`, `JAW_SECS`), brow/cheek sculpt, head paint |
| `rparts` | teeth, dorsal spikes (`SPIKES`), horns, claws, living eyes (`eyes`) |
| `rrig` | armature + IK controls (feet are planted by IK, then baked) |
| `rskin` | rigid parts → one bone each, heat weights for the body |
| `ranim` | Idle / Walk / Run / Attack / Death as pose functions of phase `t` |
| `rexport` | deform-only export rig, joined mesh, `Velociraptor_*` actions |
| `rbuild` | runs everything in order and exports the GLB |

## Making a new raptor kind

1. Copy `raptor.blend` (e.g. `raptor-frost.blend`).
2. In `rbuild`, set `VARIANT`: a new `palette` (keys of `P` in `rlib`, hex colours)
   and an `out` path (default: `assets/models/dinos/raptor.glb` relative to the .blend). For shape changes edit `N` (rbody), `HEAD_SECS` (rlib) or
   `SPIKES` (rlib).
3. Run `rbuild` in Blender's text editor, or headless:
   `blender -b raptor-frost.blend --python-expr "import bpy; exec(bpy.data.texts['rbuild'].as_string(), {})"`
4. If the walk/run legs changed, re-measure strides (median grounded foot speed ×
   clip duration) and update `glbCatalog.js`. `test/dino-glb.test.js` checks loop
   seams, knee snapping at run speed, jaw opening and triangle counts.

Notes: the game opens the jaw with a negative local X rotation (the `Jaw` bone's
roll is flipped in `rrig`). Keep the run foot sweep short enough that the leg never
straightens fully, or the knee flips at touchdown.
