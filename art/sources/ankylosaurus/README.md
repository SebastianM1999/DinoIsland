# Ankylosaurus source

`ankylosaurus.blend` builds the whole Ankylosaurus from an empty scene: run the `abuild` text block (it
writes `assets/models/dinos/ankylosaurus.glb` relative to the .blend). `scripts/` mirrors the text blocks
for review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b ankylosaurus.blend --python-expr "import bpy; exec(bpy.data.texts['abuild'].as_string(), {})"`

While iterating in live Blender, `91_adev.py` reloads every `scripts/*.py` into its text block first and
then execs the steps named in `ADEV_STEPS`; `92_adiag.py` runs the checks (`ADIAG`: ground, steps, low, sheets).

Brief: `docs/newDinos/new-dinos.md` (second entry) and `docs/newDinos/Ankylosaurus.png`. Proportions measured
from the reference at ~5 mm per pixel: authored at real scale (about 7.3 m long incl. club and spikes,
2.66 m tall in Blender, facing -Y), 30 fps clips.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `views`, `export`, `eyes`, `mouth` | shared dino-blender-creator helpers (copies of the skill scripts) |
| `alib` | palette `AP` (olive-brown hide, tan belly, pale tan plates, charcoal club, grey beak), `ahide()` (countershade + mottling + pebble studs) |
| `abody` | trunk (club-tail stem -> low, very wide dome -> short thick neck) as one spline tube, four short sturdy pillar legs, grey nails (3 hind, 5 front) |
| `ahead` | small, wide, flat-roofed triangular head with a heavy brow shelf, hooked beak, slim lower jaw (`mouth.jaw_prof`) with trough + tongue, amber living eyes (grumpy-calm: `Ht .45, Hb .53, tilt .2`, round pupil) |
| `afuse` | skull + jaw + neck fused into ONE mesh (`fuse_head`), legs union-filleted into the trunk; clears stray head/jaw regions on the front toes (they reach forward under the neck) |
| `aarmor` | 59 square-ish pointed plates in alternating rows over the dome (ray cast onto the fused body), keeled flank spikes along the dome edge, long shoulder spikes, two spiked neck half-rings, paired tail spikes and tail scutes, skull roof knobs, squamosal + upper corner horns, two-lobed knobbly tail club |
| `apaint` | vertex colours for every part, two materials (skin, gloss) |
| `arig` | armature: Body, Shoulders, Neck1-2, Head, flipped Jaw, Tail1-6 (club on Tail6), four IK legs |
| `askin` | spine distance weights, leg weights that only take over clearly outside the wide trunk (the default `limb_weights` fade creased the flank), Head/Jaw from the fuse regions + `cheeks`, plates and spikes copy the weights of the skin under them, horns/eyes rigid on Head, club on Tail6, nails on the feet, max 4 influences |
| `aanim` | Idle (5 s: look-around with holds, graze + chew, club twitch), Walk (lateral sequence waddle), Run (heavy trot, diagonal pairs), Attack (1.4 s tail-club swing: hips pivot over the planted hind feet, tail coils left during the 0-0.36 wind-up, whips right, club crosses the centre ~0.48, peak ~0.55, front feet step with the pivot), Death (2 s, legs give way, drops onto the belly, slight roll, head sinks) |
| `aexport` | samples clips, deform-only export rig, `Ankylosaurus_*` actions, GLB |
| `abuild` | master: clears the scene, sets 30 fps and runs everything above |

Measured (`check_glb.mjs ... --length 6.9`): height 2.511 m at 6.9 m length, walk stride 1.142 m, run
stride 2.254 m, max knee step 0.314 rad per 1/60 s at 2.2 Hz cadence (limit 0.4), 51,616 triangles, 2,541
vertices follow the Jaw. All clips keep every vertex at or above -0.012 m (`ground_report`).

## Not integrated into the game yet

The GLB is not registered: a species needs `GLB_DINOS` (`model('ankylosaurus', 'Ankylosaurus', 2.511, 6.9,
1.142, 2.254, true)`, bones `jaw: 'Jaw'`, `neck: ['Neck1', 'Neck2']`, `spine: ['Body', 'Shoulders']`,
`tail: Tail1-6`, `maxCadence` 2.2), a `SPECIES` view entry with a procedural fallback, `CONFIG` species data
and AI (slow, turns its back and swings the club when the player is close), spawns,
`art/asset-manifest.json`, `test/dino-glb.test.js` (`authored` list + `sourceTriangles`) and
`extraHitZones`: the generic joint spheres cover only ~17 % of the surface, so measure head/plate/flank/
leg/club spheres with `hit_coverage.mjs` until >= 95 % (plates as an armour zone). The club hitbox should be
measured from the Attack clip like `src/sim/ai/stego.js` `SWEEP`.
