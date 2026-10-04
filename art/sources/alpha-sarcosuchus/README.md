# Alpha Sarcosuchus

Project-authored model based on `docs/newDinos/new-dinos.md` and the supplied
`AlphaSarcosuchus.png`. The owner's revision calls for dark green crocodilian hide,
dense plate scales and irregular bloody scars rather than pale armor, dots or tubes.

The model is the unique boss in Drowned Hollow, the middle arena on the second
island (Misty Swamp). The authoritative simulation owns spawning, attack damage,
ambushes and the low-health phase. The client plays the matching clips, sound
warnings, water ripples and disturbed mud. The fitted length is 16.2 m: the owner's
follow-up reduces length and height by 10% while retaining the original width.

## Source and rebuild

Open `alpha-sarcosuchus.blend` and execute the `abuild` text block. It reloads the
numbered Python files from `scripts/`, clears the scene, builds fused body/head/jaw and
limbs, paints skin, rigs with planted-foot IK, bakes clips and exports
`assets/models/dinos/alpha-sarcosuchus.glb` relative to this source file.
Blender 5.2.1 LTS was used through Blender MCP. Do not reset factory settings with the
addon running. Rebuild verified from an empty scene.

- `abody`: continuous trunk, long wedge snout, mouth trough, fused jaw and limbs.
- `adetail`: beveled plate scales, cranial and limb scutes, vertex-painted fine scale
  fields, nearly black green pigments, bright red wounds, interlocking worn teeth,
  claws and one red / one yellow glowing slit eye.
  Irregular scar masks stain the actual skin and plates and slightly recess the skin;
  there are no separate scar sticks or tubes.
  The refined skin combines irregular scale cells, dark seams, mottled olive
  centers, ventral shield bands, joint folds and weathered, ribbed plate crowns.
  Raptor hide variation and stego plate painting informed the contrast and density.
- `arig`: Body/Shoulders, Neck1/2, Head, flipped Jaw, Tail1..8 and four IK legs.
  Plates over the limbs are separated from the body armor into the leg scale mesh.
  Plate weights are interpolated from the underlying skin, including shoulder/hip
  transitions, so scales follow the leg surface during walk and run.
- `aanim`: Idle 5 s, Walk 1.6 s, Run 1 s, Attack 1.333 s, Roar 2 s, Death 2.2 s,
  TailSweep 1.6 s, Swim 1.6 s, Bite 0.767 s, Shove 0.867 s, Pivot 1 s,
  Retreat 1.2 s, Ambush 1.6 s and Recovery 1.467 s. Attack includes head lift for
  runtime jaw clearance. Dedicated attack clips have wind-up, strike and settle.
  Refined attacks brace the front pads, compress the hips, snap the jaws with a
  short rebound, then take staggered contact steps. TailSweep plants the front
  legs while the hind legs widen their brace; Ambush paddles into two front-foot
  bank contacts and a separate hind drive. Pivot and Recovery transfer weight
  through individual swing arcs rather than sliding all four feet together.
- `aexport`: deform-only rig, joined skinned model, four vertex-color materials,
  30 fps sampled animation. Source and export collections are separate.

## Measurements and validation

- 58,575 triangles, below the 60,000 limit; no image textures.
- Game fit: 16.2 m long, 3.4308 m high, about 4.428 m wide.
- Original walk/run strides: 1.866 / 3.775 m per cycle; fitted strides are 90%
  of those values (1.679 / 3.398 m). Maximum cadence is 2.55 Hz to preserve speed.
- IK rest knee error: 0; normalized deform weights, no unweighted vertices.
- 3,588 exported vertices carry majority Jaw weight.
- Knee changes at maximum cadence: walk 0.184 / run 0.204 rad per 1/60 s.
- Rest-pose client hit-sphere coverage: 99.6% at 0.12 m margin.
- 94 leg-area plates transferred out of body armor; walk/run limb close-ups are
  saved as `review/walk-legs.png` and `review/run-legs.png`.
- Fourteen clip contact sheets and facial reviews are in `review/`.
- Tail sweep damage geometry was measured from the animated tail skin: hip pivot
  1.5696 m behind the root, strike 0.667–1.267 s, approximately 148 degrees across
  the rear and sides. Reach varies from 6.365–7.523 m while the tail folds and extends.
  The 1,792 sampled tail skin vertices use unchanged lateral scale and 90%
  longitudinal scale; damage envelopes are measured after fitting, not uniformly shrunk.
- The torso stays level on banks; bounded two-bone leg corrections follow the terrain.
  Water support is resolved after movement in absolute world height, with a smooth
  committed emergence rather than adding an old swimming offset to a new bank height.

From the repository root:

```powershell
node art/sources/alpha-sarcosuchus/scripts/90_validate.mjs assets/models/dinos/alpha-sarcosuchus.glb alpha-sarcosuchus --length 16.2
node art/sources/alpha-sarcosuchus/scripts/91_coverage.mjs
node --test test/sarco-model.test.js
npm test
node server/index.js --port 8094
```

The validation scripts use the same Sarcosuchus model contract as the gameplay
catalog. The model regression checks dark skin, bright scars, both emissive eye
materials, weights, jaw skin, loop closure and sampled ground clearance in raw
clips and with the runtime overlays. Boss simulation tests cover dodge windows,
committed misses, knockback, enrage chains and recovery.

Review: http://localhost:8094/src/client/models/dino/preview.html?type=alpha-sarcosuchus&state=walk&view=three-quarter
