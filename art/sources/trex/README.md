# T-Rex source

`trex.blend` builds the whole T-Rex from an empty scene: run the `tbuild` text
block (it writes `assets/models/dinos/trex.glb` relative to the .blend).
`scripts/` mirrors the text blocks for review; the .blend is what runs.

Headless: `blender -b trex.blend --python-expr "import bpy; exec(bpy.data.texts['tbuild'].as_string(), {})"`

Built from the raptor template (`rlib` is the raptor's library, incl. its head
profiles). `tlib` overrides the palette and maps the raptor head into a longer,
wider, much deeper T-Rex skull (`MAPP`). The model is authored at raptor scale
(~3.3 m long); the game fits it to 11 m (see `glbCatalog.js`).

| Script | Builds |
| --- | --- |
| `eyes`, `mouth` | skill helpers: living eyes (slim slanted lid opening, slit pupil, catchlights) and lower jaw (jawline keel, inward lip the lower teeth root in, mouth trough, tongue) |
| `tbody` | skin-modifier skeleton: horizontal trunk, thick neck, massive thighs, 3-toed feet, tiny 2-finger arms |
| `thead` | blunt boxy skull with brow ridge, jaw muscles, nasal bumps, brow hornlets, living amber eyes (`eyes`), keel-profile lower jaw with mouth trough + tongue (`mouth`), two rows of teeth |
| `tmerge` | fuses skull, lower jaw and body into one mesh (exact boolean union, smoothed fillet at the neck). Ahead of the mouth corner the jaw top is pressed just under the skull so the lips never weld; the corner skin stretches when the jaw opens. Region weights drive Head/Jaw skinning and paint |
| `tparts` | foot and hand claws, low bony scutes along neck/back/tail |
| `tpaint` | grey hide (`rex_skin` in `tlib`): dark back, grey flanks, dark mottling, cream throat/belly, dark eye mask, pink mouth; teeth rooted in the measured gum line |
| `trig` / `tskin` | theropod rig (same bone names as the raptor) with IK feet; rigid head/jaw parts |
| `tanim` | Idle, Walk, Run, Attack (bite + head shake), Roar (loops while the game roars), Death |
| `texport` | samples clips, deform-only export rig, `TRex_*` actions, GLB export |

References: classic T-Rex side profile (proportions), and a grey front view with
bony knobs over the eyes, cream underside and a wide pink mouth. The game's
lighting is darker than Blender's preview; judge colours in the dino preview page
(`/src/client/models/dino/preview.html?type=trex`).

The game adds its own jaw-open overlay to attack/roar, so the clips keep the jaw
at ~0.5 rad. Strides at 11 m (walk 4.719 m, run 7.928 m) are measured from the
export and live in `glbCatalog.js`.
