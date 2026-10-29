# Velociraptor source

Rebuilt from scratch (Oct 2026). `raptor.blend` holds every build step as a text block; `scripts/` is the same
code as `.py` files. Rebuild everything from an empty scene and export the GLB (Blender with this file open):

```python
exec(open(r'<repo>/art/sources/raptor/scripts/rbuild.py').read(), globals())
```

`rbuild.py` loads the `dino-blender-creator` library from `.claude/skills`, refreshes the text blocks from
`scripts/`, runs the steps and writes `assets/models/dinos/raptor.glb` (path relative to the .blend).

| Step | What |
|---|---|
| `00_libs.py` | loads the skill library, `R_run(step)` |
| `01_shape.py` | trunk spline tube (tail tip -> neck top inside the skull), wedge skull + keel jaw fused (`fuse_head`), legs, toes, arms, palm and three fingers union-filleted in |
| `02_details.py` | teeth rooted on the measured lip lines (overbite over the narrower jaw), living eyes, finger/toe/sickle claws, quill crest, tongue |
| `03_paint.py` | "sunset hunter" palette: rust back, ochre flanks, chocolate tiger stripes, dark eye mask, red gum line, teal brow + quills |
| `04_rig.py` | `RaptorRig`: Body, Torso, Neck1-2, Head, Jaw (flipped roll), Tail1-5, theropod IK legs, ArmUp/ArmLow/Hand; skinning |
| `05_anim.py` | Idle, Walk, Run, Attack (bite + sickle kick), Death (rolls onto its right side) + `R_reach` / `R_femur_range` checks |
| `06_export.py` | `export_dino` -> `Velociraptor_<Clip>` actions |
| `90_views.py` | `R_shots(tag)` review sheet into `%TEMP%/raptor_shots` |

Lessons from this rebuild (also in the skill):
- The first legs folded "into the body": the rest leg was 88 % extended, so every stride over-extended it and the
  femur swung up to 64 deg. The rest pose is now bent (~77 %), the legs sit on the body sides (`R_LX`), and the thigh
  is skinned as muscle in body skin (`muscle_limb_weights`). Keep `R_reach` <= 0.95 per clip.
- Hands: a palm plus three separate finger tubes, claws continuing the fingertips. Clear `rg_*` weights on anything
  low (the finger unions sit ahead of `head_back_y` and picked up red mouth paint).

Numbers (from `check_glb.mjs`): 53,426 tris, 1.676 x 3.455 m, walk stride 1.727 m, run stride 4.31 m,
knee step <= 0.28 rad at 2 Hz, hit coverage 96.8 % with 5 extra zones.
