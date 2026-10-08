# Sump Lurker

Ambush predator of the flooded cave tunnels of the "Hollow Mountain" level. Built from the Alpha Sarcosuchus
sources (`../alpha-sarcosuchus`) but rebuilt as its own animal: slim (trunk x0.7), low (final z squash 0.82, x 0.8),
a long narrow gharial snout with needle teeth, blotchy cold-slate back fading to pale flanks and belly, tiny clouded
eyes (no glow), a ridge of small pale scutes and faint teal-cyan vertex-colour speckles along the lips (a lure).
Sprawled legs (slimmer tubes), tail sculls for swimming. Game fit: 5 m long, 0.723 m high (uniform scale 0.281).

## Rebuild

Open `sump-lurker.blend`, run the `sbuild` text block. It reloads `scripts/NN_*.py` into text blocks, clears the scene
and the leftover actions of the template copy, builds body/detail/rig/clips and exports
`assets/models/dinos/sump-lurker.glb` (relative to this file). Do not reset factory settings with the MCP addon running.

- `sbody`: trunk (`S_TRUNK0` x slimming factors), fused skull/jaw/neck, needle teeth, slim sprawled legs.
- `sdetail`: pale hide paint (`s_hide`, `s_lure`), small scutes, clouded eyes, then bakes the final proportions
  (`S_WX`, `S_ZF`) into every mesh and the data text (`sdata`).
- `srig`: same bones as the sarcosuchus (z coordinates scaled by `S_ZF`), IK legs with outward poles, crisp limb weights.
- `sanim`: Idle 5 s (submerged float, feet tucked), Walk 1.6 s (short shuffle), Run 1 s, Attack 1.33 s (lunge, jaws at
  0.67 s), Bite 0.77 s, Swim 1.6 s, Hurt 0.8 s, Retreat 1.2 s, Ambush 1.6 s, Death 2.2 s. Gape is limited to 0.3 rad: the
  snout is long.
- `sexport`: deform-only rig, one skinned mesh, two vertex-colour materials, 30 fps.

## Measurements

- 51,565 triangles, no textures; jaw skin 3,366 verts; IK rest error < 3 mm.
- check_glb (length 5): height 0.723, walk stride 0.429 m, run stride 1.053 m, max knee step 0.21 rad per 1/60 s at 2.4 Hz.
- Hit coverage with 8 extra zones: 98.4 % at 0.12 m margin.

```powershell
node .claude/skills/dino-blender-creator/scripts/check_glb.mjs assets/models/dinos/sump-lurker.glb sump-lurker --length 5
node .claude/skills/dino-blender-creator/scripts/hit_coverage.mjs sump-lurker
node --test test/sump-lurker.test.js
```

Review: http://localhost:<port>/src/client/models/dino/preview.html?type=sump-lurker&state=walk&view=three-quarter
