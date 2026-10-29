# T-Rex source

Rebuilt from scratch (Oct 2026). `trex.blend` holds every build step as a text block; `scripts/` is the same code
as `.py` files. Rebuild everything from an empty scene and export the GLB (Blender with this file open):

```python
exec(open(r'<repo>/art/sources/trex/scripts/tbuild.py').read(), globals())
```

Authored at ~4.4 m raw length; the game fits it uniformly to the catalog length (11 m, scale 2.553).
Working objects are `TRexMesh` / `TRexArm`: `export_dino` deletes objects named like its export (`TRex`, `TRexRig`).

| Step | What |
|---|---|
| `01_shape.py` | trunk spline tube, legs on the body sides with a bent rest pose, thick toes, tiny arms; wide boxy skull (brow shelf only over the eyes, lacrimal horn, rugose nasal bumps) + deep keel jaw fused |
| `02_details.py` | banana teeth on the measured lip lines, forward-facing living eyes, two hand claws, three toe claws, two rows of back scutes, tongue |
| `03_paint.py` | "forest tyrant": moss back, olive flanks, dark-green mottling, dark eye band, rust brow horns and scute tips |
| `04_rig.py` | `TRexArm`: theropod rig (Body, Torso, Neck1-2, Head, Jaw, Tail1-5, IK legs, arms) + skinning |
| `05_anim.py` | Idle, Walk, Run, Attack (lunging bite + damped head shake), Roar (2 s loop), Death (rolls onto its right side) |
| `06_export.py` | `export_dino` -> `TRex_<Clip>` actions |

Numbers (from `check_glb.mjs --length 11`): 49,396 tris, 5.503 x 11 m, walk stride 5.318 m, run stride 8.204 m,
knee step <= 0.16 rad at 1.25 Hz, hit coverage 96.5 % with 13 extra zones.
