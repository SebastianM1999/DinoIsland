# T-Rex step 2: banana teeth on the measured lip lines, forward-facing living eyes, claws, bony back scutes, tongue.
import bpy, bmesh, math
from mathutils import Vector as V

for n in ('TTeethU', 'TTeethD', 'TClaws', 'TScutes', 'TTongue'): remove(n)

# ---------------------------------------------------------------- teeth: thick, few, curved back; two big fangs; stop before the tip
T_ys = sorted({y for k, y in T_teeth_lines if k == 'U'}, reverse=True)
bm = bmesh.new(); bmd = bmesh.new()
for i, y in enumerate(T_ys):
    if y < -2.10: continue
    xu, zu = T_teeth_lines[('U', y)]; xd, zd = T_teeth_lines[('D', y)]; jx = T_teeth_lines[('J', y)]
    fang = i in (3, 9)
    L = (0.085, 0.07)[i % 2] + (0.04 if fang else 0) - 0.025 * smooth(2, 0, i) - 0.008 * max(0, i - 9)
    r0 = 0.026 + (0.008 if fang else 0)
    for sx in (1, -1):
        x = xu * 0.9
        horn_bm(bm, (sx * x, y, zu + 0.03), (sx * max(x + 0.006, jx + 0.012), y + 0.014, zu - L), r0, bend=(0, 0.014, 0), seg=8, rings=6, flat=0.72)
        if i % 2 == 1 and y > -2.06:
            Ld = 0.06 + (0.02 if i in (5,) else 0)
            horn_bm(bmd, (sx * xd * 0.9, y, zd - 0.025), (sx * xd * 0.88, y + 0.01, zd + Ld), 0.022, bend=(0, 0.008, 0), seg=8, rings=6, flat=0.72)
mk('TTeethU', bm); mk('TTeethD', bmd)

# ---------------------------------------------------------------- eyes: forward-facing, sunk under the brow horn, angry
dg = bpy.context.evaluated_depsgraph_get()
hit = bpy.context.scene.ray_cast(dg, V((1.0, -1.475, 2.015)), V((-1, 0, 0)))
T_EYE = dict(c=(hit[1].x - 0.045, -1.475, 2.015), R=0.076, yaw=0.42, W=0.9, Ht=0.38, Hb=0.5, tilt=0.34,
             rim=(0.17, 0.09), pupil=(0.09, 0.34), iris=0.68, ball=(28, 18), rimseg=(44, 7))
build_eyes('T', T_EYE)

# ---------------------------------------------------------------- claws: 2 per tiny hand, 3 big toe claws per foot
bm = bmesh.new()
for sx in (1, -1):
    for dx in (-0.02, 0.02):
        horn_bm(bm, (sx * (0.27 + dx), -1.135, 0.985), (sx * (0.272 + dx * 1.2), -1.2, 0.93), 0.018, bend=(0, -0.016, 0.006), seg=8, rings=6, flat=0.7)
    for tx, ty in ((T_LX + 0.01, -0.26), (T_LX - 0.085, -0.2), (T_LX + 0.1, -0.19)):
        d = V((tx - T_LX, ty - 0.02, 0)).normalized()
        horn_bm(bm, (sx * tx, ty + 0.01, 0.07), (sx * (tx + d.x * 0.07), ty + d.y * 0.07 - 0.005, 0.018), 0.04, bend=(0, -0.01, 0.02), seg=8, rings=6, flat=0.75)
mk('TClaws', bm)

# ---------------------------------------------------------------- scutes: two rows of low bony bumps from the skull roof down the back and tail
bm = bmesh.new()
for i in range(22):
    u = i / 21; y = -1.26 + 2.9 * u
    for sx in (1, -1):
        x0 = sx * (0.07 - 0.04 * u)
        hit = bpy.context.scene.ray_cast(dg, V((x0, y, 4)), V((0, 0, -1)))
        if not hit[0]: continue
        p = hit[1]; L = (0.075 - 0.045 * u) * (1.15 if i % 2 == 0 else 0.85)
        horn_bm(bm, (x0, y, p.z - 0.02), (x0 * 1.2, y + 0.03, p.z + L), 0.04 - 0.022 * u, bend=(0, 0.01, 0), seg=8, rings=5, flat=0.8)
mk('TScutes', bm)

add_tongue('TTongue', (0, -1.66, T_mouth(-1.66) - 0.04), (0.075, 0.3, 0.022), seg=(18, 10))
