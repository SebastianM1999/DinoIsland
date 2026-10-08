# Gloom Raptor source

Cave-dwelling, nearly blind cousin of the raptor (`art/sources/raptor`), built from the same pipeline
(rig, IK-baked clips, export) with its own shape and paint. `gloom-raptor.blend` is the master; its text
blocks (`glib`, `gbody`, `ghead`, `gparts`, `grig`, `gskin`, `ganim`, `gexport`, `gbuild`, plus the skill's
`eyes` and `mouth`) rebuild everything from an empty scene, and `scripts/` mirrors them as `.py` files.
Run `gbuild` (or `blender -b gloom-raptor.blend --python-expr "import bpy; exec(bpy.data.texts['gbuild'].as_string(), {})"`).
It writes `assets/models/dinos/gloom-raptor.glb` relative to the .blend.

Differences from the raptor:

| Script | Change |
| --- | --- |
| `glib` | pale lavender palette (violet back, near-white belly), `GLOW` cyan vertex-colour flank dots and spine dashes, `SY()` stretches the snout 17 %, narrower snout sections |
| `gbody` | leaner trunk and thighs, longer forearms |
| `ghead` | enlarged nostrils (dented, rimmed, dark), faint patch round the eyes |
| `gparts` | tiny milky eyes, ear fins (`GloomFrills`, rigid on Head), long hooked hand claws, smaller bone spikes with glowing tips |
| `ganim` | crouched nose-low Walk, sniffing Idle, plus `Roar` (hiss, looping) and `Hurt` (flinch + stomp) |

Game fit: the model is authored at raptor scale and fitted by the catalog to 2.08 x 3.9 m (uniform
scale 1.25). Re-measure with `check_glb.mjs assets/models/dinos/gloom-raptor.glb gloom-raptor --length 3.9`
and `hit_coverage.mjs gloom-raptor` after any change, then update `glbCatalog.js` and the triangle counts
in `test/dino-glb.test.js` and `art/asset-manifest.json`.
