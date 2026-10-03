# The sail: a tall thin membrane on the back (base sunk into the body, found by ray casting the fused
# body), scalloped top with a rounded bump at every spine tip, ridged spines, thicker at the base. Plus a
# low ridge of pointed scutes along the neck and down the tail behind the sail, brow knobs, hooked hand
# claws and foot claws.
for n in ('SpSail', 'SpScutes', 'SpClaws', 'SpKnobs'): remove(n)
bpy.context.view_layer.update()
SP_BODY = bpy.data.objects['SpBody']

def sp_top(y, x=0.0):
    hit = SP_BODY.ray_cast(V((x, y, 9.0)), V((0, 0, -1)))
    return hit[1].z if hit[0] else None

SP_SAIL_TOP = [(-2.95, 3.85), (-2.45, 4.5), (-1.6, 5.3), (-0.6, 5.68), (0.4, 5.52), (1.3, 4.88), (2.0, 4.15), (2.75, 3.45)]
SP_SAIL_Y0, SP_SAIL_Y1, SP_SPINE = -2.9, 2.7, 0.42

def sp_sail_top(y):
    pts = catmull([(0, a, b, 0, 0) for a, b in SP_SAIL_TOP], 8)
    for p, q in zip(pts, pts[1:]):
        if p.y <= y <= q.y: return p.z + (q.z - p.z) * (y - p.y) / (q.y - p.y)
    return SP_SAIL_TOP[0][1] if y < SP_SAIL_TOP[0][0] else SP_SAIL_TOP[-1][1]

def sp_spine_d(y):
    """Distance to the nearest spine (along y) and the spine phase 0..1 between spines."""
    k = (y - SP_SAIL_Y0) / SP_SPINE; return abs(k - round(k)) * SP_SPINE

bm = bmesh.new()
NU, NV = 84, 10
lay = bm.verts.layers.float.new('sv')        # 0 base -> 1 top (paint)
sides = {}
for sgn in (1, -1):
    rows = []
    for i in range(NU + 1):
        y = SP_SAIL_Y0 + (SP_SAIL_Y1 - SP_SAIL_Y0) * i / NU
        zb = (sp_top(y) or 3.6) - 0.3
        ds = sp_spine_d(y); end = smooth(0, .25, y - SP_SAIL_Y0) * smooth(0, .25, SP_SAIL_Y1 - y)
        zt = sp_sail_top(y) + 0.13 * (math.exp(-(ds / .09) ** 2) - 0.4)                     # scallops at the spine tips
        zt = zb + max(0.05, (zt - zb)) * (0.35 + 0.65 * end)
        col = []
        for j in range(NV + 1):
            v = j / NV; z = zb + (zt - zb) * v
            th = (0.11 * (1 - v) + 0.035) * (0.4 + 0.6 * end) + 0.02 * math.exp(-(ds / .05) ** 2) * (1 - .6 * v)
            vv = bm.verts.new((sgn * th, y + 0.04 * v * math.sin(i * .9), z)); vv[lay] = v; col.append(vv)
        rows.append(col)
    sides[sgn] = rows
L, R = sides[1], sides[-1]
for i in range(NU):
    for j in range(NV):
        bm.faces.new((L[i][j], L[i + 1][j], L[i + 1][j + 1], L[i][j + 1]))
        bm.faces.new((R[i][j + 1], R[i + 1][j + 1], R[i + 1][j], R[i][j]))
    bm.faces.new((L[i][NV], L[i + 1][NV], R[i + 1][NV], R[i][NV]))          # top rim
    bm.faces.new((R[i][0], R[i + 1][0], L[i + 1][0], L[i][0]))              # base (hidden in the body)
for i in (0, NU):
    for j in range(NV):
        f = (L[i][j], L[i][j + 1], R[i][j + 1], R[i][j]); bm.faces.new(f if i == NU else tuple(reversed(f)))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mk('SpSail', bm)

bm = bmesh.new()   # dorsal scutes: neck (skull back -> sail) and tail behind the sail
SP_SCUTES = []
for y in [-4.05 + 0.2 * k for k in range(6)] + [2.65 + 0.28 * k for k in range(12)]:
    z = sp_top(y)
    if z is None: continue
    L_ = (.15 if y < 0 else .2 - .012 * (y - 2.6)) * (1 if int(round(y * 5)) % 2 else .75)
    horn_bm(bm, (0, y + .03, z - .05), (0, y + L_ * .7, z + L_), .07 + L_ * .3, bend=(0, .02, -.01), seg=10, rings=6, flat=.5)
    SP_SCUTES.append(y)
mk('SpScutes', bm)

bm = bmesh.new()   # pointed brow hornlets raking back off the brow shelf (angry silhouette; round knobs looked cute)
for sx in (1, -1):
    for dy, x, L in ((-.1, .36, .13), (.08, .38, .17), (.26, .39, .14), (.42, .38, .1)):
        hit = SP_BODY.ray_cast(V((sx * x, SP_EYE.y + dy, 9.0)), V((0, 0, -1)))
        if hit[0]:
            b = hit[1] - hit[2] * .03; d = (hit[2] + V((sx * .3, .9, .2))).normalized()
            horn_bm(bm, b, b + d * L, .05 + L * .2, bend=(0, .01, .02), seg=8, rings=5, flat=.6)
mk('SpKnobs', bm)

bm = bmesh.new()   # big hooked hand claws (thumb biggest) and foot claws, on the measured tips
for i, (s, tip) in enumerate(SP_FINGERTIPS):
    t = V(tip); L_ = .58 if i % 3 == 0 else .44                 # big hooked sickle claws, thumb the largest
    horn_bm(bm, t + V((0, .03, .08)), t + V((0, .22, -L_)), .1 if i % 3 == 0 else .08, bend=(0, -.18, -.02), seg=10, rings=8)
for s, tip in SP_TOETIPS:
    t = V(tip)
    horn_bm(bm, t + V((0, .06, .03)), t + V((0, -.24, -.06)), .075, bend=(0, -.02, .05), seg=10, rings=7)
mk('SpClaws', bm)
