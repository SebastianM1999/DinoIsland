# Brachio step 2: peg teeth at the front of the mouth, gentle round-pupil eyes, toenails, tongue.
import bpy, bmesh, math
from mathutils import Vector as V

for n in ('BTeethU', 'BTeethD', 'BNails', 'BTongue'): remove(n)
B_ys = sorted({y for k, y in B_teeth_lines if k == 'U'}, reverse=True)
bm = bmesh.new(); bmd = bmesh.new()
for i, y in enumerate(B_ys):
    xu, zu = B_teeth_lines[('U', y)]; xd, zd = B_teeth_lines[('D', y)]
    for sx in (1, -1):
        horn_bm(bm, (sx * xu * 0.9, y, zu + 0.05), (sx * xu * 0.9, y - 0.01, zu - 0.05), 0.05, seg=8, rings=4, flat=1.0)
        horn_bm(bmd, (sx * xd * 0.88, y, zd - 0.05), (sx * xd * 0.88, y - 0.01, zd + 0.04), 0.045, seg=8, rings=4, flat=1.0)
mk('BTeethU', bm); mk('BTeethD', bmd)

dg = bpy.context.evaluated_depsgraph_get()
_ey, _ez = B_hy(-5.5), B_hz(12.76)
hit = bpy.context.scene.ray_cast(dg, V((3, _ey, _ez)), V((-1, 0, 0)))
B_EYE = dict(c=(hit[1].x - 0.07, _ey, _ez), R=0.2, yaw=0.12, W=0.92, Ht=0.56, Hb=0.62, tilt=0.06,
             rim=(0.15, 0.09), pupil=(0.27, 0.3), iris=0.72, ball=(24, 16), rimseg=(40, 6))
build_eyes('B', B_EYE)

# blunt nails: thumb claw + two front nails on the front feet, three on the hind feet
bm = bmesh.new()
for sx in (1, -1):
    for leg, nails in ((B_FLEG, ((-0.36, 0.13), (0.0, 0.1), (0.3, 0.09))), (B_BLEG, ((-0.32, 0.11), (0.0, 0.11), (0.32, 0.1)))):
        fx, fy, fz, rx, ry = leg[-1]
        for dx, r in nails:     # ray-cast onto the pad front, root 5 cm inside it, blunt and slightly down-turned
            hit = bpy.context.scene.ray_cast(dg, V((sx * (fx + dx), fy - 3, 0.2)), V((0, 1, 0)))
            base = hit[1] + V((0, 0.06, 0))
            horn_bm(bm, base, base + V((sx * dx * 0.12, -0.17, -0.12)), r, bend=(0, -0.02, 0.04), seg=8, rings=5, flat=0.75)
mk('BNails', bm)

add_tongue('BTongue', (0, B_hy(-5.9), B_mouth(B_hy(-5.9)) - 0.09), (0.2, 0.62, 0.05), seg=(16, 8))
