# Brachiosaurus source

Rebuilt from scratch (Oct 2026), real scale. `brachio.blend` holds every build step as a text block; `scripts/` is
the same code as `.py` files. Rebuild everything from an empty scene and export the GLB (Blender with this file open):

```python
exec(open(r'<repo>/art/sources/brachio/scripts/bbuild.py').read(), globals())
```

Working objects are `BrachioMesh` / `BrachioArm` (`export_dino` deletes objects named like its export).

| Step | What |
|---|---|
| `01_shape.py` | trunk spline tube tail -> body -> neck (top inside the skull); pillar legs with a real joint bend and round pads tapering gradually, end caps pressed flat into soles (`B_SOLE`); small domed head authored in design units and scaled x1.3 (`B_hy`/`B_hz`/`B_hv`) + shallow jaw, fused |
| `02_details.py` | peg teeth, gentle round-pupil eyes, nails ray-cast onto the pad fronts, tongue |
| `03_paint.py` | "gentle giant": steel-blue back with dark dapples, cream throat strip, low peach nasal rise, dusky feet |
| `04_rig.py` | `BrachioArm`: Body, Shoulders, Neck1-6, Head, Jaw, Tail1-8, quadruped IK legs (pole angles searched for zero rest error); pads ride the Foot bone; cheeks |
| `05_anim.py` | Idle (look-around, chew), Walk (lateral sequence), Run, Attack = rear-up stomp over the 0.8 s server windup, Death (topples onto its side, neck curls to the ground) |
| `06_export.py` | `export_dino` -> `Brachiosaurus_<Clip>` actions |

Numbers (from `check_glb.mjs`): 50,928 tris, 13.289 x 18.244 m, walk stride 2.714 m, run stride 5.333 m,
knee step <= 0.09 rad at 1.25 Hz, hit coverage 96.6 % with 4 extra zones.
