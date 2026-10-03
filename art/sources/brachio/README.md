# Brachiosaurus source

`brachio.blend` builds the whole Brachiosaurus from an empty scene: run the
`bbuild` text block (it writes `assets/models/dinos/brachio.glb` relative to the
.blend). `scripts/` mirrors the text blocks for review; the .blend is what runs.

Headless: `blender -b brachio.blend --python-expr "import bpy; exec(bpy.data.texts['bbuild'].as_string(), {})"`

| Script | Builds |
| --- | --- |
| `lib` | shared helpers (same as the raptor's): lofts, tubes along splines, blobs, horns, `paint()` |
| `eyes`, `mouth` | skill helpers: living eyes (lid opening, rim, iris, pupil disc, catchlights; reduced resolution for the 60k budget) and lower jaw (jawline keel, inward lip, mouth trough, tongue) |
| `blib` | brachio palette `BP` (slate back, grey flanks, cream throat/belly) and `bskin()` |
| `bbody` | trunk (tail → body → near-vertical neck) and four pillar legs as spline tubes, foot pads + toenails |
| `bhead` | small head with arched nasal crest, opening jaw (keel profile, mouth trough, tongue), gentle living eyes (round pupil, almost level lids), peg teeth |
| `bpaint` | vertex colours for every part, materials |
| `brig` | armature: 6 neck, 8 tail bones, 4 IK legs (front poles behind, hind poles in front), jaw |
| `bskin` | heat weights for body/legs, rigid head/jaw/feet |
| `banim` | Idle (6 s), Walk (lateral sequence), Run (flee), Attack (0.8 s rear-up + stomp), Death |
| `bexport` | samples clips, deform-only export rig, `Brachiosaurus_*` actions, GLB export |

Concept reference: near-vertical neck, front legs longer than hind legs, short
horizontal tail, dark grey back with pale cream underside.

Notes: the front legs are almost straight at rest, so gaits keep a slight crouch
(Body z −0.3) to stop the elbows snapping straight. The stomp keeps the hips low;
the hind legs only have ~0.14 m of slack. Strides (walk 2.714 m, run 5.333 m) are
measured from the export and live in `glbCatalog.js`.
