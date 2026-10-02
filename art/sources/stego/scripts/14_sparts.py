# Back plates (two alternating rows, biggest over the hips, fanning away from the hip peak) and the
# thagomizer (4 tail spikes). Bases are found by ray casting the fused body, sunk into the skin.
for n in ('StegoPlates', 'StegoSpikes'): remove(n)
bpy.context.view_layer.update()
S_BODY = bpy.data.objects['StegoBody']

def s_top(x, y):
    hit = S_BODY.ray_cast(V((x, y, 6.0)), V((0, 0, -1)))
    return hit[1].z if hit[0] else None

def s_plate_bm(bm, base, h, w, th, out, lean, seg=20, rings=13, e=1.7):
    """Flat leaf/diamond plate: narrow waist at the base, widest at ~40 %, rounded point at the tip.
    'ht' layer = height fraction (0 base -> 1 tip) for the paint gradient."""
    lay = bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht')
    lw = bm.verts.layers.float.get('pw') or bm.verts.layers.float.new('pw')
    R = mathutils.Matrix.Rotation(lean, 3, 'X') @ mathutils.Matrix.Rotation(out, 3, 'Y')
    rs = []
    for i in range(rings):
        u = i / (rings - 1)
        ww = w * max(0.04, math.sin(math.pi * (0.2 + 0.8 * u)) ** 0.75) * (1 - 0.15 * u)
        tt = th * (1 - 0.65 * u) + 0.012
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            p = V((tt * sgnpow(math.cos(a), 2 / e), ww * sgnpow(math.sin(a), 2 / e), h * u))
            v = bm.verts.new(V(base) + R @ p); v[lay] = u; v[lw] = sgnpow(math.sin(a), 2 / e); ring.append(v)
        rs.append(ring)
    for r0, r1 in zip(rs, rs[1:]):
        for j in range(seg): bm.faces.new((r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]))
    bm.faces.new(list(reversed(rs[0])))
    tip = bm.verts.new(V(base) + R @ V((0, 0, h * 1.02))); tip[lay] = 1.0
    for j in range(seg): bm.faces.new((rs[-1][j], rs[-1][(j + 1) % seg], tip))

S_PLATES = []                      # (y, side, height) - kept for skinning and the README
bm = bmesh.new()
for i in range(14):
    y = -2.3 + 0.42 * i; sx = 1 if i % 2 == 0 else -1
    h = 0.28 + 0.95 * math.exp(-((y - 0.9) / 1.9) ** 2)
    x = sx * (0.1 + 0.03 * h)
    z = s_top(x, y)
    if z is None: continue
    S_PLATES.append((y, sx, h))
    s_plate_bm(bm, (x, y, z - 0.06 - 0.1 * h), h + 0.06 + 0.1 * h, 0.36 * h + 0.08, 0.06 + 0.05 * h,
               out=sx * (0.16 + 0.04 * math.sin(i * 1.7)), lean=-0.32 * math.tanh((y - 0.9) / 1.6))
plates = mk('StegoPlates', bm)

bm = bmesh.new()   # 4 spikes: two pairs near the tail tip, pointing out, up and back
for y, L in ((4.2, 1.3), (4.8, 1.1)):
    zc = s_top(0, y) - 0.14
    for sx in (1, -1):
        base = V((sx * .1, y, zc)); d = V((sx * .62, .5, .6)).normalized()
        horn_bm(bm, base, base + d * L, .15 if L > 1.2 else .13, bend=(0, .09, .05), seg=12, rings=8)
mk('StegoSpikes', bm)
