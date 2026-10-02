# Pteranodon source

`ptera.blend` builds the whole Pteranodon from an empty scene: run the `pbuild` text block (it writes
`assets/models/dinos/ptera.glb` relative to the .blend). `scripts/` mirrors the text blocks for review
(file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b ptera.blend --python-expr "import bpy; exec(bpy.data.texts['pbuild'].as_string(), {})"`

Real scale: 6.5 m wingspan, 2.56 m beak-to-tail, 1.86 m to the crest tip. Bind pose = gliding
T-pose (wings level, legs hanging), lowest point at z = 0.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `export` | shared dino-blender-creator helpers |
| `plib` | palette `PP` (umber-grey hide, crimson skull + crest, horn beak, cream membranes), `p_tube()` (tube with a fixed frame axis, never twists), `pskin()` |
| `pbody` | trunk (tail stub -> deep chest -> S-neck) as one tube, thin hanging legs with four toes + claws |
| `phead` | short skull with a long toothless dagger beak, lower beak, swept-back crest blade, sunk slit-pupil eyes under angry lids |
| `pwing` | arm tubes (shoulder, elbow, wrist, wing finger), thin membrane slabs to a swept trailing edge (with `mu`/`mv` coordinates), three hand claws per wrist |
| `pfuse` | skull + beak + neck fused into ONE mesh (`fuse_head`), arms boolean-unioned into the chest with a fillet |
| `ppaint` | vertex colours, two materials (skin, gloss) |
| `prig` | Body, Shoulders, Neck1-2, Head, flipped Jaw, Tail1-2, WingUp/Low/Hand/Finger per side, FK legs |
| `pskin` | spine distance weights, arm skin crisp on the wing bones (gated by distance), Head/Jaw from the fuse regions, membrane stretched between wing bones and body, max 4 influences |
| `panim` | Idle (hover), Fly (flap 1 s), Glide (3 s), Dive, Attack (flare + talons + beak snap, then power stroke), Fall (dead tumble, loops), Death (impact from the Fall pose, bounce, lies sprawled) |
| `pexport` / `pbuild` | export / master rebuild |
| `pshots` | review helper only (ortho views + clip contact sheets) |

Game (`glbCatalog.js` `ptera`, `glbDino.js` `flightState`): the ptera is a `flyer`. Alive in the air
it flaps when climbing, glides when sinking and alternates when level; `DS.DIVE` plays Dive; the attack
cue plays Attack. Killed in the air, the server keeps it falling ballistically (`src/sim/dinos.js`);
the client loops Fall until it is down, then plays Death once and keeps the last pose as the
carcass. Death frame 0 equals Fall frame 0, so the switch at impact never pops. Body pitch follows
the flight path and the body banks into turns about the torso (`pivot`). Hit zones: generic head/
neck/body/tail plus 12 `wing` spheres along the membranes. Walk/Run map to Fly/Glide (it never walks).
