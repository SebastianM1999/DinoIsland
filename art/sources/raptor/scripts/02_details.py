# Raptor step 2: teeth (rooted on the measured lip lines), living eyes, claws, quill crest, tongue.
# Needs R_teeth_lines from 01_shape (same run).
import bpy, bmesh, math
from mathutils import Vector as V

for n in ('RTeethU', 'RTeethD', 'RClaws', 'RQuills', 'RTongue'): remove(n)

# ---------------------------------------------------------------- teeth: blades, alternating sizes, two fangs, stop before the tip
R_ys = sorted({y for k, y in R_teeth_lines if k == 'U'}, reverse=True)
bm = bmesh.new(); bmd = bmesh.new()
for i, y in enumerate(R_ys):
    if y < -1.50: continue
    xu, zu = R_teeth_lines[('U', y)]; xd, zd = R_teeth_lines[('D', y)]; jx = R_teeth_lines[('J', y)]
    fang = i in (4, 12)
    L = (0.04, 0.031)[i % 2] + (0.022 if fang else 0) - 0.005 * max(0, i - 12) - 0.012 * smooth(3, 0, i)
    r0 = 0.012 + (0.004 if fang else 0)
    for sx in (1, -1):
        x = xu * 0.9                                             # root inside the upper lip, tip leans out over the jaw
        horn_bm(bm, (sx * x, y, zu + 0.016), (sx * max(x + 0.004, jx + 0.006), y + 0.007, zu - L), r0, bend=(0, 0.006, 0), seg=8, rings=6, flat=0.6)
        if i % 2 == 0 and y > -1.47:
            Ld = 0.026 + (0.01 if i in (2, 10) else 0)
            horn_bm(bmd, (sx * xd * 0.9, y, zd - 0.012), (sx * xd * 0.88, y + 0.005, zd + Ld), 0.009, bend=(0, 0.004, 0), seg=8, rings=6, flat=0.6)
mk('RTeethU', bm); mk('RTeethD', bmd)

# ---------------------------------------------------------------- eyes: sunk under the brow, angry predator lids, slit pupil
dg = bpy.context.evaluated_depsgraph_get()
hit = bpy.context.scene.ray_cast(dg, V((0.5, -1.055, 1.548)), V((-1, 0, 0)))
R_EYE = dict(c=(hit[1].x - 0.026, -1.055, 1.548), R=0.042, yaw=0.30, W=0.9, Ht=0.38, Hb=0.5, tilt=0.34,
             rim=(0.17, 0.09), pupil=(0.09, 0.34), iris=0.68, ball=(28, 18), rimseg=(44, 7))
build_eyes('R', R_EYE)

# ---------------------------------------------------------------- claws: 3 per hand, toe claws, the raised sickle claw
bm = bmesh.new()
for sx in (1, -1):
    for f in R_FINGERS:      # claws continue the fingertips and hook down
        (x1, y1, z1, *_), (x2, y2, z2, r2, _r) = f[-2], f[-1]
        d = V((x2 - x1, y2 - y1, z2 - z1)).normalized()
        base = V((x2, y2, z2)) - d * 0.008
        horn_bm(bm, (sx * base.x, base.y, base.z), (sx * (x2 + d.x * 0.045), y2 + d.y * 0.04, z2 - 0.04), r2 * 1.05,
                bend=(0, -0.012, 0.006), seg=8, rings=6, flat=0.7)
    horn_bm(bm, (sx * (0.218 + R_LX), -0.165, 0.042), (sx * (0.22 + R_LX), -0.228, 0.012), 0.017, bend=(0, -0.006, 0.012), seg=8, rings=6, flat=0.7)
    horn_bm(bm, (sx * (0.27 + R_LX), -0.13, 0.04), (sx * (0.285 + R_LX), -0.182, 0.012), 0.014, bend=(0, -0.005, 0.01), seg=8, rings=6, flat=0.7)
    horn_bm(bm, (sx * (0.168 + R_LX), -0.075, 0.118), (sx * (0.163 + R_LX), -0.135, 0.05), 0.021, bend=(0, -0.04, 0.03), seg=10, rings=8, flat=0.5)
mk('RClaws', bm)

# ---------------------------------------------------------------- quill crest: flattened spines from the brow back over the neck to the hips
bm = bmesh.new()
for i in range(18):
    u = i / 17; y = -0.97 + 1.0 * u
    hit = bpy.context.scene.ray_cast(dg, V((0, y, 3)), V((0, 0, -1)))
    if not hit[0]: continue
    p = hit[1]; L = (0.075 - 0.04 * u) * (1.15 if i % 2 == 0 else 0.85)
    horn_bm(bm, (0, y - 0.012, p.z - 0.01), (0, y + 0.035 + 0.02 * u, p.z + L), 0.016 - 0.005 * u, bend=(0, 0.012, 0), seg=8, rings=6, flat=0.45)
mk('RQuills', bm)

# ---------------------------------------------------------------- tongue in the jaw trough (hidden while the mouth is shut)
add_tongue('RTongue', (0, -1.2, R_mouth(-1.2) - 0.02), (0.03, 0.17, 0.011), seg=(18, 10))
