# Wings: arm tube (shoulder -> elbow -> wrist -> long wing finger) + a thin membrane slab spanned
# between the arm and a swept trailing edge that runs back to the hip, + three hand claws at the wrist.
# Membrane verts carry 'mu' (0 body -> 1 tip) and 'mv' (0 arm -> 1 trailing edge) for paint + skin.
for n in ('PteraArms', 'PteraMembrane', 'PteraHandClaws'): remove(n)
# joints shared with the rig: shoulder, elbow, wrist, knuckle, tip  (left wing = +X)
P_WINGJ = {s: [(.13*sx, -0.24, 1.1), (.55*sx, -0.1, 1.12), (1.25*sx, -0.3, 1.13), (2.2*sx, 0.03, 1.12), (3.25*sx, 0.5, 1.1)]
           for s, sx in (('L', 1), ('R', -1))}
P_ARM = [(.04, -0.21, 1.07, .07, .07), (.13, -0.24, 1.1, .085, .075), (.34, -0.17, 1.11, .072, .062), (.55, -0.1, 1.12, .058, .052),
         (.9, -0.2, 1.125, .043, .038), (1.25, -0.3, 1.13, .05, .043), (1.7, -0.15, 1.125, .03, .026), (2.2, 0.03, 1.12, .024, .02),
         (2.75, 0.27, 1.11, .015, .012), (3.25, 0.5, 1.1, .006, .005)]
P_TRAIL = [(.1, 0.34, 1.0), (.55, 0.55, 1.07), (1.2, 0.63, 1.1), (1.9, 0.61, 1.11), (2.6, 0.58, 1.105), (3.05, 0.55, 1.1), (3.25, 0.5, 1.1)]

def p_arclen_curve(pts, n):
    """Resample a Catmull-Rom curve through pts at n+1 points evenly spaced by arc length."""
    dense = [p.xyz if len(p) > 3 else p for p in catmull([tuple(q) + (0, 0) for q in pts], 12)]
    dense = [V(p[:3]) for p in dense]
    acc = [0.0]
    for a, b in zip(dense, dense[1:]): acc.append(acc[-1] + (b - a).length)
    out = []
    for i in range(n + 1):
        t = acc[-1] * i / n; j = max(1, next((k for k, s in enumerate(acc) if s >= t), len(acc) - 1))
        u = (t - acc[j - 1]) / max(1e-9, acc[j] - acc[j - 1]); out.append(dense[j - 1].lerp(dense[j], u))
    return out

arms, mems = [], []
bmc = bmesh.new()
for s, sx in (('L', 1), ('R', -1)):
    arms.append(p_tube('Arm' + s, [(x * sx, y, z, r1, r2) for x, y, z, r1, r2 in P_ARM], ring=12, k=4, sub=1, ref=(0, 0, 1)))
    NU, NV = 56, 14
    lead = p_arclen_curve([(x * sx, y, z) for x, y, z, _, _ in P_ARM[1:]], NU)
    trail = p_arclen_curve([(x * sx, y, z) for x, y, z in P_TRAIL], NU)
    bm = bmesh.new(); lu = bm.verts.layers.float.new('mu'); lv = bm.verts.layers.float.new('mv')
    top, bot = [], []
    for i in range(NU):                       # stop one step short of the tip (edges meet there)
        u = i / NU; rt, rb = [], []
        for j in range(NV + 1):
            v = j / NV; p = lead[i].lerp(trail[i], v)
            p.z -= 0.06 * math.sin(math.pi * min(1, u * 1.15)) * math.sin(math.pi * v) ** 0.8   # slight billow
            th = (0.026 * (1 - v) ** 0.7 + 0.006) * (1 - 0.6 * u)
            for lst, sgn in ((rt, 1), (rb, -1)):
                q = bm.verts.new((p.x, p.y, p.z + sgn * th / 2)); q[lu] = u; q[lv] = v; lst.append(q)
        top.append(rt); bot.append(rb)
    for i in range(NU - 1):
        for j in range(NV):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]))
        for j in (0, NV):                     # leading + trailing edge
            bm.faces.new((top[i][j], bot[i][j], bot[i + 1][j], top[i + 1][j]))
    for i in (0, NU - 1):                     # body side + tip side
        for j in range(NV): bm.faces.new((top[i][j], top[i][j + 1], bot[i][j + 1], bot[i][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mems.append(mk('Mem' + s, bm))
    # three small hooked hand claws on the wrist, pointing forward and down
    w = V((1.25 * sx, -0.3, 1.13))
    for k, (dx, dz) in enumerate(((-.03, .03), (0, 0), (.03, -.03))):
        b = w + V((dx * sx, -0.035, dz)); d = V((.15 * sx, -1, -.35)).normalized()
        horn_bm(bmc, b, b + d * .075, .013, bend=(0, 0, -.015), seg=8, rings=5)
mk('PteraHandClaws', bmc)
for group, name in ((arms, 'PteraArms'), (mems, 'PteraMembrane')):
    for o in group: apply_mods(o)
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]; bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = ob.data.name = name
