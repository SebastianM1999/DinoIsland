# Pachycephalosaurus source

`pachycephalosaurus.blend` builds the whole Pachycephalosaurus from an empty scene: run the `pcbuild` text block
(it writes `assets/models/dinos/pachycephalosaurus.glb` relative to the .blend). `scripts/` mirrors the text
blocks for review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b pachycephalosaurus.blend --python-expr "import bpy; exec(bpy.data.texts['pcbuild'].as_string(), {})"`

While iterating in live Blender, `91_pcdev.py` reloads every `scripts/*.py` into its text block first and then
execs the steps named in `PCDEV_STEPS`; `92_pcdiag.py` runs the checks (`PCDIAG`: ground, steps, low, sheets).

Brief: `docs/newDinos/new-dinos.md` (fifth entry: thick rounded skull dome, small spikes round the back of the
head, strong hind legs; warm reddish-brown body, pale cream belly, light bone-coloured dome; lowers its head and
charges, headbutts with knockback) and `docs/newDinos/Pachycephalosaurus.png`. Owner: "his attack is just charging
with his head and headbutting players, with big knockback". Proportions measured from the reference at ~3.2 mm
per pixel: authored at real scale (4.23 m long, 1.9 m to the dome top, facing -Y; fitted to 4.5 m in the game), 30 fps clips. Built on the
Dilophosaurus pipeline.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `views`, `export`, `eyes`, `mouth` | shared dino-blender-creator helpers (copies of the skill scripts) |
| `pclib` | palette `PCP`, `pchide()` (countershade + soft dark saddles + speckles) |
| `pcbody` | trunk (stiff tail -> barrel body -> short thick neck) as one spline tube; strong hind legs with three toes, small arms with three fingers, all separate tubes |
| `pchead` | short deep face with a plain closed snout and a straight mouth line (a hooked beak read as a "napping turtle"); the compact dome is part of the skull loft (round-topped sections rising behind the snout - a separate ellipsoid read as a ball sitting on the head); the whole head is designed in reference measurements and shrunk to 70 % about the neck joint by `pch()` (`pclib`; the full-size head looked "too big, funny") - every head coordinate in `pchead`, `pcparts`, `pcpaint` and the Head/Jaw bones goes through `pch()`; lower jaw (`mouth.jaw_prof`), alert round-pupil eyes |
| `pcfuse` | skull + jaw + neck fused into ONE mesh (`fuse_head`), limb parts unioned one by one (EXACT, no `use_self`) with one fillet pass |
| `pcparts` | knob ring round the back/sides of the dome + a smaller second row, blunt spikes at its rear rim, knobs behind the eyes, small snout spikes (all snapped onto the measured surface; a knob that snaps > 12 cm away is dropped), back/tail scutes, nails |
| `pcpaint` | vertex colours (red-brown hide, cream only on the underside, thin dark mouth line, darker snout tip, bone dome with fine crazing, bone knobs/spikes), two materials |
| `pcrig` | armature: Body, Torso, Neck1-2, Head, flipped Jaw, Tail1-6, theropod IK legs, FK arms |
| `pcskin` | spine distance weights, crisp limb weights outside the trunk tube, Head/Jaw from the fuse regions + `cheeks`, scutes copy the back skin, knobs/spikes/eyes rigid on Head, nails on Hand/BackToes |
| `pcanim` | Idle (5 s: looks around, a dome head-bob, sniffs the ground), Walk, Run = the charge (body level and low, neck straight, dome aimed forward like a ram and held steady), Attack = headbutt (1.0 s: rock back + lower the dome 0-0.28 = dodge time, ram dome-first with a jolt at ~0.45, whip the head up to toss the target 0.5-0.62, settle), Roar = challenge display (2 s loop: dome lowered, two bull-like ground scrapes, snorts, tail lashing), Death (2 s, onto the belly) |
| `pcexport` | samples clips, deform-only export rig, `Pachycephalosaurus_*` actions, GLB |
| `pcbuild` | master: clears the scene, sets 30 fps and runs everything above |

Measured (`check_glb.mjs ... --length 4.5`): height 2.025 m at 4.5 m length, walk stride 1.276 m, run stride
2.658 m, max knee step 0.32 rad per 1/60 s at 3 Hz cadence (limit 0.4), 39,833 triangles, 1,809 vertices follow
the Jaw. All clips keep every vertex above the ground (`ground_report` min z >= 0.004).

## Not integrated into the game yet

The GLB is not registered: a species needs `GLB_DINOS` (`model('pachycephalosaurus', 'Pachycephalosaurus', 2.025,
4.5, 1.276, 2.658, true)`, bones = raptor theropod bones with `neck: ['Neck1', 'Neck2']`, `tail: Tail1-6`,
`clips.roar = 'Pachycephalosaurus_Roar'`, `maxCadence` 3.0), a `SPECIES` view entry with a procedural fallback,
`CONFIG` species data and AI, spawns, `art/asset-manifest.json`, `test/dino-glb.test.js` and `extraHitZones`
(dome, snout, tail) measured with `hit_coverage.mjs`.

The owner's gameplay brief needs sim/AI work, not just the model: the AI should lower its head (`pose.roar` for
the challenge display, then `pose.charge` -> Run), charge in a straight line at the player, and resolve the
headbutt at ~45 % of the Attack clip (the dome contact) with a big knockback impulse; the hitbox should be measured
from the Attack clip like `src/sim/ai/stego.js` `SWEEP`.
