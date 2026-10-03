# Stegosaurus source

`stego.blend` builds the whole Stegosaurus from an empty scene: run the `sbuild` text block (it
writes `assets/models/dinos/stego.glb` relative to the .blend). `scripts/` mirrors the text blocks
for review (file `NN_name.py` = text block `name`); the .blend is what runs.

Headless: `blender -b stego.blend --python-expr "import bpy; exec(bpy.data.texts['sbuild'].as_string(), {})"`

Authored at real scale (about 9.3 m in Blender, facing -Y); the game fits it to 7.9 m.

| Script | Builds |
| --- | --- |
| `lib`, `anim`, `fuse`, `weights`, `sheet`, `export` | shared dino-blender-creator helpers (same as the other species) |
| `eyes`, `mouth` | skill helpers: living eyes (lid opening, rim, iris, pupil disc, catchlights) and lower jaw (jawline keel, inward lip, mouth trough, tongue, cheeks) |
| `slib` | stego palette `SP` (teal-sage hide, round spots, mustard belly, brick-red plates), `sskin()`, `s_limb()` leg tube that never twists at the knee |
| `sbody` | trunk (long weapon tail -> arched back -> low neck) as one spline tube, four pillar legs (long hind, short front), toenails |
| `shead` | small low head: blunt snout, soft overbite jaw, living amber eyes (round pupil, slight grumpy slant) under a brow ridge |
| `sfuse` | skull + jaw + neck fused into ONE mesh (`fuse_head`), legs boolean-unioned in with a smoothed fillet |
| `sparts` | 14 plates in two alternating rows (biggest over the hips, fanning out), 4 tail spikes |
| `spaint` | vertex colours for every part, two materials (skin, gloss) |
| `srig` | armature: Body, Shoulders, Neck1-2, Head, flipped Jaw, Tail1-7, four IK legs |
| `sskin` | spine distance weights; legs take over only outside the trunk tube and near the leg (continuous fade), Head/Jaw from the fuse regions, rigid plates/spikes/eyes/nails, max 4 influences |
| `sanim` | Idle (5 s), Walk (lateral sequence), Run (charge: rotary gallop, head low), Attack (1.2 s tail swing, strike ~45 %), Death (2 s) |
| `sexport` | samples clips, deform-only export rig, `Stegosaurus_*` actions, GLB |
| `sbuild` | master: clears the scene and runs everything above |
| `sshots` | review helper only (ortho views + clip contact sheets), not part of the build |

Gameplay fit (`src/shared/config.js`, `src/sim/ai/stego.js`):

- The tail hitbox is the arc the tail really sweeps. `SWEEP` in `stego.js` holds the tail/spike angles
  around the hip pivot measured from the Attack clip (wind-up to the right 0-0.43 s, harmless; strike
  across to the left 0.43-0.70 s). Every player inside the swept sector (reach 4.1 m from the hips +
  tail width + player radius) is hit once per swing. If you re-animate the Attack clip, re-measure it.
- Hit from the front (`counterCone`, `counterRange`): it pivots on its front legs during the wind-up so
  its rump lands about 1.6 m from the attacker, then counters for `tailCounterDamage`. It commits to
  that spot, so only sprinting away during the ~0.5 s wind-up escapes; walking or backing off does not
  (`test/stego-tail.test.js`).
- The charge (8.8 m/s) plays Run: measured stride 3.414 m, `maxCadence` 2.6 Hz so the feet stay
  planted. Walk stride 1.414 m.
- Client hit spheres: generic joint spheres plus `extraHitZones` in `glbCatalog.js` (armour plates,
  weak flanks, snout, lower legs, thick tail base), measured from this file; about 98 % of the surface
  is covered.

Notes: the front legs are short, so the gallop keeps a slight shoulder crouch and the front feet
sweep less than the hind feet (same ground speed, shorter stance). Skin weights for the legs fade
continuously; selection boxes tore the thigh skin in strong poses. The leg boolean union can hand
leg vertices stray head-region weights, `sfuse` clears them (otherwise the mouth paint lands on the
thighs).
